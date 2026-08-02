from __future__ import annotations

import hashlib
import hmac
import json
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Sum

from .models import AuditEvent, Order


def _canonical_payload(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str).encode("utf-8")


def record_audit_event(*, organization, actor, action: str, entity_type: str, entity_id: str, payload: dict) -> AuditEvent:
    with transaction.atomic():
        previous = (
            AuditEvent.objects.select_for_update()
            .filter(organization=organization)
            .order_by("-sequence")
            .first()
        )
        sequence = (previous.sequence if previous else 0) + 1
        previous_hash = previous.event_hash if previous else ""
        body = {
            "organization_id": str(organization.id),
            "sequence": sequence,
            "actor_id": str(actor.id),
            "action": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "payload": payload,
            "previous_hash": previous_hash,
        }
        event_hash = hmac.new(
            settings.AUDIT_HMAC_KEY.encode("utf-8"),
            _canonical_payload(body),
            hashlib.sha256,
        ).hexdigest()
        return AuditEvent.objects.create(
            organization=organization,
            sequence=sequence,
            actor=actor,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            payload=payload,
            previous_hash=previous_hash,
            event_hash=event_hash,
        )


def recalculate_order_total(order: Order) -> Decimal:
    total = order.items.aggregate(value=Sum("line_total"))["value"] or Decimal("0")
    Order.objects.filter(pk=order.pk).update(total=total)
    order.total = total
    return total
