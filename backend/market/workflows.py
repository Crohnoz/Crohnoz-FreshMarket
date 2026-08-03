from __future__ import annotations

import hashlib
import json
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers, status
from rest_framework.exceptions import APIException, ValidationError

from .models import AuditEvent, InventoryLot, Order, Organization, Product
from .services import recalculate_order_total, record_audit_event


class WorkflowConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "La operación entra en conflicto con el estado actual."
    default_code = "workflow_conflict"


def canonical_decimal(value) -> str | None:
    if value in (None, ""):
        return None
    return format(Decimal(str(value)).normalize(), "f")


def canonical_signature(payload: dict) -> str:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def require_idempotency_key(request) -> str:
    key = str(request.headers.get("Idempotency-Key", "")).strip()
    if len(key) < 8 or len(key) > 96:
        raise ValidationError({"idempotency_key": "Envía una clave de reintento segura de 8 a 96 caracteres."})
    return key


def require_if_match(request, current_version: int) -> None:
    expected = str(request.headers.get("If-Match", "")).strip().strip('"')
    if not expected:
        raise ValidationError({"if_match": "Actualiza la pantalla antes de continuar; falta la versión del pedido."})
    if expected != str(current_version):
        raise WorkflowConflict("El pedido cambió. Actualiza la pantalla antes de guardar nuevamente.", code="stale_order")


def _find_idempotent_event(*, organization, action: str, key: str) -> AuditEvent | None:
    events = AuditEvent.objects.filter(organization=organization, action=action).order_by("-sequence")
    for event in events.iterator(chunk_size=200):
        if event.payload.get("idempotency_key") == key:
            return event
    return None


def _replay_or_conflict(*, organization, action: str, key: str, signature: str, entity_id=None):
    event = _find_idempotent_event(organization=organization, action=action, key=key)
    if event is None:
        return None
    if entity_id is not None and event.entity_id != str(entity_id):
        raise WorkflowConflict("La clave de reintento ya fue usada en otro registro.", code="idempotency_conflict")
    if event.payload.get("request_signature") != signature:
        raise WorkflowConflict("La clave de reintento ya fue usada con datos diferentes.", code="idempotency_conflict")
    return event


class InventoryReceptionSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    received_at = serializers.DateField()
    best_before = serializers.DateField(required=False, allow_null=True)
    quantity_received = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    quality = serializers.ChoiceField(choices=InventoryLot.Quality.choices, default=InventoryLot.Quality.GOOD)
    notes = serializers.CharField(max_length=240, required=False, allow_blank=True, default="")

    def validate_product(self, product):
        organization = self.context["organization"]
        if product.organization_id != organization.id:
            raise serializers.ValidationError("El producto no pertenece al negocio activo.")
        if not product.is_active:
            raise serializers.ValidationError("El producto está inactivo y no puede recibir inventario.")
        return product

    def validate(self, attrs):
        if attrs.get("best_before") and attrs["best_before"] < attrs["received_at"]:
            raise serializers.ValidationError({"best_before": "La fecha preferente no puede ser anterior a la recepción."})
        return attrs


def reception_signature(validated_data: dict) -> str:
    return canonical_signature({
        "product": str(validated_data["product"].id),
        "received_at": validated_data["received_at"].isoformat(),
        "best_before": validated_data.get("best_before").isoformat() if validated_data.get("best_before") else None,
        "quantity_received": canonical_decimal(validated_data["quantity_received"]),
        "unit_cost": canonical_decimal(validated_data["unit_cost"]),
        "quality": validated_data["quality"],
        "notes": validated_data.get("notes", ""),
    })


def receive_inventory(*, organization, actor, validated_data: dict, idempotency_key: str):
    signature = reception_signature(validated_data)
    with transaction.atomic():
        Organization.objects.select_for_update().get(pk=organization.pk)
        replay = _replay_or_conflict(
            organization=organization,
            action="inventorylot.received",
            key=idempotency_key,
            signature=signature,
        )
        if replay is not None:
            lot = InventoryLot.objects.select_related("product").get(
                organization=organization,
                pk=replay.payload["lot_id"],
            )
            return lot, True

        quantity = validated_data["quantity_received"]
        lot = InventoryLot(
            organization=organization,
            product=validated_data["product"],
            received_at=validated_data["received_at"],
            best_before=validated_data.get("best_before"),
            quantity_received=quantity,
            quantity_available=quantity,
            unit_cost=validated_data["unit_cost"],
            quality=validated_data["quality"],
            status=InventoryLot.Status.ACTIVE,
            notes=validated_data.get("notes", ""),
        )
        lot.full_clean()
        lot.save()
        record_audit_event(
            organization=organization,
            actor=actor,
            action="inventorylot.received",
            entity_type=lot._meta.label_lower,
            entity_id=str(lot.pk),
            payload={
                "lot_id": str(lot.pk),
                "product_id": str(lot.product_id),
                "quantity_received": canonical_decimal(quantity),
                "unit_cost": canonical_decimal(lot.unit_cost),
                "idempotency_key": idempotency_key,
                "request_signature": signature,
                "version": lot.version,
            },
        )
        return lot, False


class WeighingLineSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    actual_quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))


class OrderWeighingSerializer(serializers.Serializer):
    items = WeighingLineSerializer(many=True, allow_empty=False)

    def validate_items(self, items):
        ids = [str(item["id"]) for item in items]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Cada línea debe aparecer una sola vez.")
        return items


def weighing_signature(order: Order, validated_data: dict) -> str:
    items = sorted(
        ({"id": str(item["id"]), "actual_quantity": canonical_decimal(item["actual_quantity"])} for item in validated_data["items"]),
        key=lambda item: item["id"],
    )
    return canonical_signature({"order_id": str(order.pk), "items": items})


def transition_order(*, order: Order, actor, target_status: str, action: str, request, payload: dict | None = None):
    idempotency_key = require_idempotency_key(request)
    signature = canonical_signature({"order_id": str(order.pk), "payload": payload or {}})
    with transaction.atomic():
        Organization.objects.select_for_update().get(pk=order.organization_id)
        locked = Order.objects.select_for_update().prefetch_related("items__product").get(pk=order.pk)
        replay = _replay_or_conflict(
            organization=locked.organization,
            action=action,
            key=idempotency_key,
            signature=signature,
            entity_id=locked.pk,
        )
        if replay is not None:
            return locked, True

        require_if_match(request, locked.version)
        allowed_from = {
            Order.Status.PREPARING: Order.Status.CONFIRMED,
            Order.Status.READY: Order.Status.PREPARING,
        }[target_status]
        if locked.status != allowed_from:
            raise WorkflowConflict(
                f"El pedido debe estar en estado {allowed_from} antes de pasar a {target_status}.",
                code="invalid_order_transition",
            )
        if target_status == Order.Status.READY and locked.items.filter(actual_quantity__isnull=True).exists():
            raise ValidationError({"items": "Registra el peso o cantidad real de todas las líneas antes de marcar el pedido listo."})

        previous_status = locked.status
        locked.status = target_status
        locked.version += 1
        locked.full_clean()
        locked.save(update_fields=["status", "version", "updated_at"])
        record_audit_event(
            organization=locked.organization,
            actor=actor,
            action=action,
            entity_type=locked._meta.label_lower,
            entity_id=str(locked.pk),
            payload={
                "from": previous_status,
                "to": target_status,
                "idempotency_key": idempotency_key,
                "request_signature": signature,
                "version": locked.version,
            },
        )
        return locked, False


def confirm_order_weighing(*, order: Order, actor, validated_data: dict, request):
    idempotency_key = require_idempotency_key(request)
    signature = weighing_signature(order, validated_data)
    with transaction.atomic():
        Organization.objects.select_for_update().get(pk=order.organization_id)
        locked = Order.objects.select_for_update().prefetch_related("items__product").get(pk=order.pk)
        replay = _replay_or_conflict(
            organization=locked.organization,
            action="order.weighing_confirmed",
            key=idempotency_key,
            signature=signature,
            entity_id=locked.pk,
        )
        if replay is not None:
            return locked, True

        require_if_match(request, locked.version)
        if locked.status != Order.Status.PREPARING:
            raise WorkflowConflict("Solo un pedido en preparación puede registrar peso real.", code="invalid_order_transition")

        current_items = {str(item.id): item for item in locked.items.all()}
        submitted_items = {str(item["id"]): item for item in validated_data["items"]}
        if set(current_items) != set(submitted_items):
            raise ValidationError({"items": "Debes registrar exactamente todas las líneas actuales del pedido."})

        for item_id, item in current_items.items():
            item.actual_quantity = submitted_items[item_id]["actual_quantity"]
            item.full_clean()
            item.save(update_fields=["actual_quantity", "line_total", "updated_at"])

        recalculate_order_total(locked)
        locked.version += 1
        locked.save(update_fields=["total", "version", "updated_at"])
        record_audit_event(
            organization=locked.organization,
            actor=actor,
            action="order.weighing_confirmed",
            entity_type=locked._meta.label_lower,
            entity_id=str(locked.pk),
            payload={
                "items": [
                    {"id": item_id, "actual_quantity": canonical_decimal(submitted_items[item_id]["actual_quantity"])}
                    for item_id in sorted(submitted_items)
                ],
                "total": canonical_decimal(locked.total),
                "idempotency_key": idempotency_key,
                "request_signature": signature,
                "version": locked.version,
            },
        )
        return locked, False
