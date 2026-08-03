from __future__ import annotations

from uuid import UUID

from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .inventory_fefo import apply_fefo_guarded_inventory_movement
from .models import InventoryLot, InventoryMovement, Membership
from .permissions import require_role, resolve_organization_context
from .serializers import InventoryLotSerializer, InventoryMovementSerializer
from .workflows import InventoryAdjustmentSerializer, InventoryQuantityMovementSerializer


def validated_uuid(value, field_name):
    normalized = str(value or "").strip()
    if not normalized:
        return ""
    try:
        UUID(normalized)
    except (TypeError, ValueError):
        raise ValidationError({field_name: f"El identificador de {field_name} no es válido."})
    return normalized


class InventoryMovementViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = InventoryMovementSerializer
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.organization_context = resolve_organization_context(request)
        require_role(self.organization_context, Membership.Role.VIEWER)

    def get_queryset(self):
        queryset = InventoryMovement.objects.select_related("lot__product", "created_by").filter(
            organization=self.organization_context.organization
        )
        lot_id = validated_uuid(self.request.query_params.get("lot"), "lot")
        product_id = validated_uuid(self.request.query_params.get("product"), "product")
        movement_type = str(self.request.query_params.get("movement_type", "")).strip()
        if movement_type and movement_type not in InventoryMovement.MovementType.values:
            raise ValidationError({"movement_type": "El tipo de movimiento no es válido."})
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)
        if product_id:
            queryset = queryset.filter(lot__product_id=product_id)
        if movement_type:
            queryset = queryset.filter(movement_type=movement_type)
        return queryset

    def create(self, request, *args, **kwargs):
        movement_type = str(request.data.get("movement_type", "")).strip()
        allowed = set(InventoryMovement.MovementType.values)
        if movement_type not in allowed:
            raise ValidationError({"movement_type": "Selecciona un tipo de movimiento válido."})

        required_role = Membership.Role.MANAGER if movement_type == InventoryMovement.MovementType.ADJUSTMENT else Membership.Role.OPERATOR
        require_role(self.organization_context, required_role)

        lot_id = validated_uuid(request.data.get("lot"), "lot")
        if not lot_id:
            raise ValidationError({"lot": "Selecciona un lote del negocio activo."})
        lot = get_object_or_404(
            InventoryLot.objects.select_related("product").filter(organization=self.organization_context.organization),
            pk=lot_id,
        )

        serializer_class = (
            InventoryAdjustmentSerializer
            if movement_type == InventoryMovement.MovementType.ADJUSTMENT
            else InventoryQuantityMovementSerializer
        )
        serializer = serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        locked_lot, movement, replay = apply_fefo_guarded_inventory_movement(
            lot=lot,
            actor=request.user,
            movement_type=movement_type,
            validated_data=serializer.validated_data,
            request=request,
        )
        context = {"request": request, "organization": self.organization_context.organization}
        headers = {"X-Idempotent-Replay": "true"} if replay else {}
        return Response(
            {
                "lot": InventoryLotSerializer(locked_lot, context=context).data,
                "movement": InventoryMovementSerializer(movement, context=context).data,
            },
            status=status.HTTP_200_OK if replay else status.HTTP_201_CREATED,
            headers=headers,
        )