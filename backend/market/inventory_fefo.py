from __future__ import annotations

from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import InventoryLot, InventoryMovement, Organization
from .workflows import apply_inventory_movement, require_idempotency_key


def _first_fefo_lot(*, organization, product):
    eligible = (
        InventoryLot.objects.select_for_update()
        .filter(
            organization=organization,
            product=product,
            status=InventoryLot.Status.ACTIVE,
            quantity_available__gt=0,
        )
        .exclude(quality=InventoryLot.Quality.DAMAGED)
    )
    dated = eligible.filter(best_before__isnull=False).order_by(
        "best_before", "received_at", "created_at", "id"
    ).first()
    return dated or eligible.filter(best_before__isnull=True).order_by(
        "received_at", "created_at", "id"
    ).first()


def apply_fefo_guarded_inventory_movement(*, lot, actor, movement_type, validated_data, request):
    idempotency_key = require_idempotency_key(request)
    with transaction.atomic():
        organization = Organization.objects.select_for_update().get(pk=lot.organization_id)
        existing = InventoryMovement.objects.filter(
            organization=organization,
            idempotency_key=idempotency_key,
        ).first()
        if existing is not None:
            return apply_inventory_movement(
                lot=lot,
                actor=actor,
                movement_type=movement_type,
                validated_data=validated_data,
                request=request,
            )

        locked = InventoryLot.objects.select_for_update().select_related("product").get(pk=lot.pk)
        if movement_type == InventoryMovement.MovementType.CONSUMPTION:
            first = _first_fefo_lot(organization=organization, product=locked.product)
            if first is not None and first.pk != locked.pk:
                date_label = first.best_before.isoformat() if first.best_before else first.received_at.isoformat()
                raise ValidationError({
                    "lot": (
                        f"Usa primero el lote FEFO de {locked.product.name}: "
                        f"recibido el {first.received_at.isoformat()} y priorizado por {date_label}."
                    )
                })

        return apply_inventory_movement(
            lot=locked,
            actor=actor,
            movement_type=movement_type,
            validated_data=validated_data,
            request=request,
        )