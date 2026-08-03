from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework.views import exception_handler as drf_exception_handler

from .models import AuditEvent, InventoryLot, Membership, Order, Organization, Product
from .permissions import OrganizationContext, require_role, resolve_organization_context
from .serializers import (
    AuditEventSerializer,
    InventoryLotSerializer,
    MembershipSerializer,
    OrderSerializer,
    OrganizationSerializer,
    ProductSerializer,
    UserSummarySerializer,
)
from .services import record_audit_event


class LoginRateThrottle(AnonRateThrottle):
    rate = "8/min"


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "La operación entra en conflicto con el estado actual."
    default_code = "conflict"


def api_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None and isinstance(exc, IntegrityError):
        response = Response({"detail": "La operación viola una regla de integridad."}, status=409)
    if response is not None:
        response.data = {
            "error": {
                "status": response.status_code,
                "code": getattr(exc, "default_code", "validation_error"),
                "detail": response.data,
            }
        }
    return response


class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return Response({"status": "ok", "service": "crohnoz-fresh-market-api", "version": "0.2.0-mvp"})


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        username = str(request.data.get("username", "")).strip()
        password = str(request.data.get("password", ""))
        if not username or not password:
            raise ValidationError({"credentials": "Ingresa usuario y contraseña."})

        user = authenticate(request=request, username=username, password=password)
        if user is None or not user.is_active:
            raise ValidationError({"credentials": "Usuario o contraseña incorrectos."}, code="invalid_credentials")

        max_age = timedelta(hours=settings.PILOT_TOKEN_MAX_HOURS)
        token = Token.objects.filter(user=user).first()
        if token and token.created < timezone.now() - max_age:
            token.delete()
            token = None
        if token is None:
            token = Token.objects.create(user=user)

        memberships = list(
            Membership.objects.select_related("organization")
            .filter(user=user, is_active=True, organization__status=Organization.Status.ACTIVE)
            .order_by("organization__name")
        )
        if not memberships:
            token.delete()
            raise ValidationError({"membership": "La cuenta no tiene un negocio activo asignado."})

        default_organization = memberships[0].organization_id if len(memberships) == 1 else None
        return Response({
            "token": token.key,
            "user": UserSummarySerializer(user).data,
            "memberships": MembershipSerializer(memberships, many=True).data,
            "default_organization": default_organization,
            "expires_at": (token.created + max_age).isoformat(),
        })


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        memberships = Membership.objects.select_related("organization").filter(user=request.user, is_active=True)
        return Response({
            "user": UserSummarySerializer(request.user).data,
            "memberships": MembershipSerializer(memberships, many=True).data,
        })


class ConnectionSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        context = resolve_organization_context(request)
        organization = context.organization
        products = Product.objects.filter(organization=organization, is_active=True).order_by("name")
        return Response({
            "organization": OrganizationSerializer(organization).data,
            "membership": MembershipSerializer(context.membership).data,
            "counts": {
                "products": products.count(),
                "inventory_lots": InventoryLot.objects.filter(organization=organization).count(),
                "orders": Order.objects.filter(organization=organization).count(),
                "audit_events": AuditEvent.objects.filter(organization=organization).count(),
            },
            "product_preview": ProductSerializer(products[:6], many=True).data,
            "server_time": timezone.now().isoformat(),
        })


class OrganizationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = OrganizationSerializer

    def get_queryset(self):
        return Organization.objects.filter(memberships__user=self.request.user, memberships__is_active=True).distinct()


class OrganizationScopedViewSet(viewsets.ModelViewSet):
    organization_context: OrganizationContext
    minimum_role_by_action = {
        "list": Membership.Role.VIEWER,
        "retrieve": Membership.Role.VIEWER,
        "create": Membership.Role.OPERATOR,
        "update": Membership.Role.OPERATOR,
        "partial_update": Membership.Role.OPERATOR,
        "destroy": Membership.Role.MANAGER,
    }

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.organization_context = resolve_organization_context(request)
        require_role(self.organization_context, self.minimum_role_by_action.get(self.action, Membership.Role.VIEWER))

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["organization"] = self.organization_context.organization
        return context

    def perform_create(self, serializer):
        with transaction.atomic():
            instance = serializer.save(organization=self.organization_context.organization)
            record_audit_event(
                organization=self.organization_context.organization,
                actor=self.request.user,
                action=f"{instance._meta.model_name}.created",
                entity_type=instance._meta.label_lower,
                entity_id=str(instance.pk),
                payload={"version": getattr(instance, "version", 1)},
            )

    def perform_update(self, serializer):
        expected = self.request.headers.get("If-Match", "").strip().strip('"')
        current = serializer.instance
        if expected and expected != str(current.version):
            raise Conflict("El registro cambió. Actualiza la pantalla antes de guardar nuevamente.")
        with transaction.atomic():
            instance = serializer.save(version=current.version + 1)
            record_audit_event(
                organization=self.organization_context.organization,
                actor=self.request.user,
                action=f"{instance._meta.model_name}.updated",
                entity_type=instance._meta.label_lower,
                entity_id=str(instance.pk),
                payload={"version": instance.version},
            )

    def perform_destroy(self, instance):
        entity_id = str(instance.pk)
        entity_type = instance._meta.label_lower
        model_name = instance._meta.model_name
        with transaction.atomic():
            instance.delete()
            record_audit_event(
                organization=self.organization_context.organization,
                actor=self.request.user,
                action=f"{model_name}.deleted",
                entity_type=entity_type,
                entity_id=entity_id,
                payload={},
            )


class ProductViewSet(OrganizationScopedViewSet):
    serializer_class = ProductSerializer
    minimum_role_by_action = {
        **OrganizationScopedViewSet.minimum_role_by_action,
        "create": Membership.Role.MANAGER,
        "update": Membership.Role.MANAGER,
        "partial_update": Membership.Role.MANAGER,
    }

    def get_queryset(self):
        return Product.objects.filter(organization=self.organization_context.organization)


class InventoryLotViewSet(OrganizationScopedViewSet):
    serializer_class = InventoryLotSerializer

    def get_queryset(self):
        return InventoryLot.objects.select_related("product").filter(organization=self.organization_context.organization)


class OrderViewSet(OrganizationScopedViewSet):
    serializer_class = OrderSerializer

    def get_queryset(self):
        return Order.objects.select_related("created_by").prefetch_related("items__product").filter(
            organization=self.organization_context.organization
        )

    def perform_create(self, serializer):
        with transaction.atomic():
            instance = serializer.save(
                organization=self.organization_context.organization,
                created_by=self.request.user,
            )
            record_audit_event(
                organization=self.organization_context.organization,
                actor=self.request.user,
                action="order.created",
                entity_type=instance._meta.label_lower,
                entity_id=str(instance.pk),
                payload={"public_id": instance.public_id, "total": str(instance.total), "version": instance.version},
            )


class AuditEventViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = AuditEventSerializer

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.organization_context = resolve_organization_context(request)
        require_role(self.organization_context, Membership.Role.MANAGER)

    def get_queryset(self):
        return AuditEvent.objects.select_related("actor").filter(organization=self.organization_context.organization)
