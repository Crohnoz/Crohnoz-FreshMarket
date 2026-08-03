from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.contrib.auth import authenticate
from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, MethodNotAllowed, ValidationError
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
from .workflows import (
    InventoryReceptionSerializer,
    OrderWeighingSerializer,
    confirm_order_weighing,
    receive_inventory,
    transition_order,
)


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


def canonical_decimal(value) -> str | None:
    if value in (None, ""):
        return None
    try:
        decimal_value = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return str(value)
    return format(decimal_value.normalize(), "f")


def request_order_signature(payload) -> dict:
    return {
        "public_id": str(payload.get("public_id", "")).strip(),
        "customer_name": str(payload.get("customer_name", "")).strip(),
        "status": Order.Status.CONFIRMED,
        "payment_method": Order.PaymentMethod.PENDING,
        "source": Order.Source.OPERATOR,
        "notes": str(payload.get("notes", "")),
        "items": [
            {
                "product": str(item.get("product", "")),
                "requested_quantity": canonical_decimal(item.get("requested_quantity")),
                "actual_quantity": None,
                "unit_price": canonical_decimal(item.get("unit_price")),
            }
            for item in (payload.get("items") or [])
        ],
    }


def stored_order_signature(order: Order) -> dict:
    return {
        "public_id": order.public_id,
        "customer_name": order.customer_name,
        "status": order.status,
        "payment_method": order.payment_method,
        "source": order.source,
        "notes": order.notes,
        "items": [
            {
                "product": str(item.product_id),
                "requested_quantity": canonical_decimal(item.requested_quantity),
                "actual_quantity": canonical_decimal(item.actual_quantity),
                "unit_price": canonical_decimal(item.unit_price),
            }
            for item in order.items.all()
        ],
    }


class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return Response({"status": "ok", "service": "crohnoz-fresh-market-api", "version": "0.3.0-mvp"})


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

        memberships = list(
            Membership.objects.select_related("organization")
            .filter(user=user, is_active=True, organization__status=Organization.Status.ACTIVE)
            .order_by("organization__name")
        )
        if not memberships:
            Token.objects.filter(user=user).delete()
            raise ValidationError({"membership": "La cuenta no tiene un negocio activo asignado."})

        max_age = timedelta(hours=settings.PILOT_TOKEN_MAX_HOURS)
        with transaction.atomic():
            Token.objects.filter(user=user).delete()
            token = Token.objects.create(user=user)

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
        queryset = Product.objects.filter(organization=self.organization_context.organization)
        active = str(self.request.query_params.get("is_active", "")).strip().lower()
        if active in {"1", "true", "yes"}:
            queryset = queryset.filter(is_active=True)
        elif active in {"0", "false", "no"}:
            queryset = queryset.filter(is_active=False)
        return queryset.order_by("name")


class InventoryLotViewSet(OrganizationScopedViewSet):
    serializer_class = InventoryLotSerializer
    minimum_role_by_action = {
        **OrganizationScopedViewSet.minimum_role_by_action,
        "receive": Membership.Role.OPERATOR,
    }

    def get_queryset(self):
        queryset = InventoryLot.objects.select_related("product").filter(organization=self.organization_context.organization)
        requested_status = str(self.request.query_params.get("status", "")).strip()
        product_id = str(self.request.query_params.get("product", "")).strip()
        if requested_status:
            queryset = queryset.filter(status=requested_status)
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        raise MethodNotAllowed("POST", detail="Usa /inventory-lots/receive/ para registrar una recepción trazable.")

    def update(self, request, *args, **kwargs):
        raise MethodNotAllowed("PUT", detail="Los lotes no se reemplazan directamente; usa movimientos de inventario.")

    def partial_update(self, request, *args, **kwargs):
        raise MethodNotAllowed("PATCH", detail="Los lotes no se editan directamente; usa movimientos de inventario.")

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed("DELETE", detail="Los lotes no se eliminan; deben agotarse o descartarse mediante movimientos.")

    @action(detail=False, methods=["post"], url_path="receive")
    def receive(self, request):
        serializer = InventoryReceptionSerializer(
            data=request.data,
            context={"organization": self.organization_context.organization},
        )
        serializer.is_valid(raise_exception=True)
        key = str(request.headers.get("Idempotency-Key", "")).strip()
        if len(key) < 8 or len(key) > 96:
            raise ValidationError({"idempotency_key": "Envía una clave de reintento segura de 8 a 96 caracteres."})
        lot, replay = receive_inventory(
            organization=self.organization_context.organization,
            actor=request.user,
            validated_data=serializer.validated_data,
            idempotency_key=key,
        )
        headers = {"X-Idempotent-Replay": "true"} if replay else {}
        return Response(
            InventoryLotSerializer(lot, context=self.get_serializer_context()).data,
            status=status.HTTP_200_OK if replay else status.HTTP_201_CREATED,
            headers=headers,
        )


class OrderViewSet(OrganizationScopedViewSet):
    serializer_class = OrderSerializer
    minimum_role_by_action = {
        **OrganizationScopedViewSet.minimum_role_by_action,
        "start_preparing": Membership.Role.OPERATOR,
        "confirm_weighing": Membership.Role.OPERATOR,
        "mark_ready": Membership.Role.OPERATOR,
    }

    def get_queryset(self):
        queryset = Order.objects.select_related("created_by").prefetch_related("items__product").filter(
            organization=self.organization_context.organization
        )
        requested_status = str(self.request.query_params.get("status", "")).strip()
        if requested_status:
            queryset = queryset.filter(status=requested_status)
        return queryset

    def update(self, request, *args, **kwargs):
        raise MethodNotAllowed("PUT", detail="Usa las transiciones explícitas del pedido; no se permite reemplazarlo completo.")

    def partial_update(self, request, *args, **kwargs):
        raise MethodNotAllowed("PATCH", detail="Usa start-preparing, confirm-weighing o mark-ready.")

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed("DELETE", detail="Los pedidos no se eliminan porque forman parte de la trazabilidad.")

    def replay_or_conflict(self, existing: Order, payload) -> Response:
        if stored_order_signature(existing) != request_order_signature(payload):
            raise Conflict("La clave de reintento ya fue usada para un pedido diferente.", code="idempotency_conflict")
        serializer = self.get_serializer(existing)
        return Response(serializer.data, status=status.HTTP_200_OK, headers={"X-Idempotent-Replay": "true"})

    def create(self, request, *args, **kwargs):
        idempotency_key = str(request.data.get("idempotency_key", "")).strip()
        if len(idempotency_key) < 8 or len(idempotency_key) > 96:
            raise ValidationError({"idempotency_key": "El pedido requiere una clave de reintento de 8 a 96 caracteres."})
        items = request.data.get("items") or []
        if any(item.get("actual_quantity") not in (None, "") for item in items):
            raise ValidationError({"items": "La cantidad real se registra únicamente durante la preparación."})
        product_ids = [str(item.get("product", "")) for item in items]
        if len(product_ids) != len(set(product_ids)):
            raise ValidationError({"items": "Cada producto debe aparecer una sola vez en el pedido."})
        existing = self.get_queryset().filter(idempotency_key=idempotency_key).first()
        if existing:
            return self.replay_or_conflict(existing, request.data)
        try:
            with transaction.atomic():
                return super().create(request, *args, **kwargs)
        except IntegrityError:
            existing = self.get_queryset().filter(idempotency_key=idempotency_key).first()
            if not existing:
                raise
            return self.replay_or_conflict(existing, request.data)

    def perform_create(self, serializer):
        with transaction.atomic():
            instance = serializer.save(
                organization=self.organization_context.organization,
                created_by=self.request.user,
                status=Order.Status.CONFIRMED,
                payment_method=Order.PaymentMethod.PENDING,
                source=Order.Source.OPERATOR,
            )
            record_audit_event(
                organization=self.organization_context.organization,
                actor=self.request.user,
                action="order.created",
                entity_type=instance._meta.label_lower,
                entity_id=str(instance.pk),
                payload={"public_id": instance.public_id, "total": str(instance.total), "version": instance.version},
            )

    @action(detail=True, methods=["post"], url_path="start-preparing")
    def start_preparing(self, request, pk=None):
        order, replay = transition_order(
            order=self.get_object(),
            actor=request.user,
            target_status=Order.Status.PREPARING,
            action="order.preparing_started",
            request=request,
        )
        headers = {"X-Idempotent-Replay": "true"} if replay else {}
        return Response(self.get_serializer(order).data, headers=headers)

    @action(detail=True, methods=["post"], url_path="confirm-weighing")
    def confirm_weighing(self, request, pk=None):
        serializer = OrderWeighingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order, replay = confirm_order_weighing(
            order=self.get_object(),
            actor=request.user,
            validated_data=serializer.validated_data,
            request=request,
        )
        headers = {"X-Idempotent-Replay": "true"} if replay else {}
        return Response(self.get_serializer(order).data, headers=headers)

    @action(detail=True, methods=["post"], url_path="mark-ready")
    def mark_ready(self, request, pk=None):
        order, replay = transition_order(
            order=self.get_object(),
            actor=request.user,
            target_status=Order.Status.READY,
            action="order.marked_ready",
            request=request,
        )
        headers = {"X-Idempotent-Replay": "true"} if replay else {}
        return Response(self.get_serializer(order).data, headers=headers)


class AuditEventViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = AuditEventSerializer

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.organization_context = resolve_organization_context(request)
        require_role(self.organization_context, Membership.Role.MANAGER)

    def get_queryset(self):
        return AuditEvent.objects.select_related("actor").filter(organization=self.organization_context.organization)
