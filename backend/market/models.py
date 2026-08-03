from __future__ import annotations

import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class UUIDTimestampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


class Organization(UUIDTimestampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Activa"
        SUSPENDED = "suspended", "Suspendida"
        ARCHIVED = "archived", "Archivada"

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=120, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Membership(UUIDTimestampedModel):
    class Role(models.TextChoices):
        OWNER = "owner", "Propietario/a"
        MANAGER = "manager", "Administrador/a"
        OPERATOR = "operator", "Operador/a"
        VIEWER = "viewer", "Solo lectura"

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="market_memberships")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.OPERATOR)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "user"], name="uniq_market_membership")]
        ordering = ["organization__name", "user__username"]

    def __str__(self) -> str:
        return f"{self.user} · {self.organization} · {self.role}"


class Product(UUIDTimestampedModel):
    class SaleUnit(models.TextChoices):
        KILOGRAM = "kg", "Kilogramo"
        UNIT = "unit", "Unidad"
        BUNDLE = "bundle", "Paquete"

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="products")
    sku = models.CharField(max_length=64)
    name = models.CharField(max_length=160)
    category = models.CharField(max_length=80, blank=True)
    sale_unit = models.CharField(max_length=16, choices=SaleUnit.choices)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "sku"], name="uniq_product_sku_per_org"),
            models.CheckConstraint(condition=Q(price__gte=0), name="product_price_nonnegative"),
        ]
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class InventoryLot(UUIDTimestampedModel):
    class Quality(models.TextChoices):
        GOOD = "good", "Buena"
        REVIEW = "review", "Revisar"
        DAMAGED = "damaged", "Dañada"

    class Status(models.TextChoices):
        ACTIVE = "active", "Activo"
        DEPLETED = "depleted", "Agotado"
        DISCARDED = "discarded", "Descartado"

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="inventory_lots")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="lots")
    received_at = models.DateField()
    best_before = models.DateField(null=True, blank=True)
    quantity_received = models.DecimalField(max_digits=12, decimal_places=3)
    quantity_available = models.DecimalField(max_digits=12, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    quality = models.CharField(max_length=16, choices=Quality.choices, default=Quality.GOOD)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    notes = models.CharField(max_length=240, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(quantity_received__gte=0), name="lot_received_nonnegative"),
            models.CheckConstraint(condition=Q(quantity_available__gte=0), name="lot_available_nonnegative"),
            models.CheckConstraint(condition=Q(quantity_available__lte=models.F("quantity_received")), name="lot_available_not_above_received"),
            models.CheckConstraint(condition=Q(unit_cost__gte=0), name="lot_cost_nonnegative"),
        ]
        ordering = ["best_before", "received_at", "created_at"]

    def clean(self) -> None:
        super().clean()
        if self.product_id and self.organization_id != self.product.organization_id:
            raise ValidationError({"product": "El producto debe pertenecer a la misma organización."})

    def __str__(self) -> str:
        return f"{self.product} · {self.received_at}"


class InventoryMovement(UUIDTimestampedModel):
    class MovementType(models.TextChoices):
        CONSUMPTION = "consumption", "Consumo"
        WASTE = "waste", "Merma"
        ADJUSTMENT = "adjustment", "Ajuste"
        SUPPLIER_RETURN = "supplier_return", "Devolución a proveedor"

    organization = models.ForeignKey(Organization, on_delete=models.PROTECT, related_name="inventory_movements")
    lot = models.ForeignKey(InventoryLot, on_delete=models.PROTECT, related_name="movements")
    lot_version = models.PositiveIntegerField()
    movement_type = models.CharField(max_length=24, choices=MovementType.choices)
    quantity_delta = models.DecimalField(max_digits=12, decimal_places=3)
    quantity_before = models.DecimalField(max_digits=12, decimal_places=3)
    quantity_after = models.DecimalField(max_digits=12, decimal_places=3)
    reason = models.CharField(max_length=240)
    reference = models.CharField(max_length=120, blank=True)
    idempotency_key = models.CharField(max_length=96)
    request_signature = models.CharField(max_length=64)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="market_inventory_movements")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "idempotency_key"], name="uniq_inventory_movement_idempotency_per_org"),
            models.CheckConstraint(condition=~Q(quantity_delta=0), name="inventory_movement_delta_nonzero"),
            models.CheckConstraint(condition=Q(quantity_before__gte=0), name="inventory_movement_before_nonnegative"),
            models.CheckConstraint(condition=Q(quantity_after__gte=0), name="inventory_movement_after_nonnegative"),
        ]
        ordering = ["-created_at", "-id"]

    def clean(self) -> None:
        super().clean()
        if self.lot_id and self.organization_id != self.lot.organization_id:
            raise ValidationError({"lot": "El lote debe pertenecer a la misma organización."})
        if self.quantity_after != self.quantity_before + self.quantity_delta:
            raise ValidationError({"quantity_after": "El saldo resultante no coincide con el movimiento."})

    def save(self, *args, **kwargs) -> None:
        if self.pk and InventoryMovement.objects.filter(pk=self.pk).exists():
            raise ValidationError("Los movimientos de inventario son inmutables.")
        if self._state.adding and self.lot_id:
            self.lot_version = self.lot.version
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Los movimientos de inventario no se pueden eliminar.")

    def __str__(self) -> str:
        return f"{self.lot} · {self.movement_type} · {self.quantity_delta}"


class Order(UUIDTimestampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Borrador"
        CONFIRMED = "confirmed", "Confirmado"
        PREPARING = "preparing", "Preparando"
        READY = "ready", "Listo"
        DELIVERED = "delivered", "Entregado"
        CANCELLED = "cancelled", "Cancelado"

    class PaymentMethod(models.TextChoices):
        PENDING = "pending", "Pendiente"
        CASH = "cash", "Efectivo"
        TRANSFER = "transfer", "Transferencia"
        CREDIT = "credit", "Fiado"

    class Source(models.TextChoices):
        OPERATOR = "operator", "Operador"
        STOREFRONT = "storefront", "Tienda"
        IMPORT = "import", "Importación"

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="orders")
    public_id = models.CharField(max_length=40)
    customer_name = models.CharField(max_length=160)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.PENDING)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.OPERATOR)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    notes = models.CharField(max_length=500, blank=True)
    idempotency_key = models.CharField(max_length=96, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="market_orders")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "public_id"], name="uniq_order_public_id_per_org"),
            models.UniqueConstraint(
                fields=["organization", "idempotency_key"],
                condition=~Q(idempotency_key=""),
                name="uniq_order_idempotency_per_org",
            ),
            models.CheckConstraint(condition=Q(total__gte=0), name="order_total_nonnegative"),
        ]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.public_id


class OrderItem(UUIDTimestampedModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="order_items")
    requested_quantity = models.DecimalField(max_digits=12, decimal_places=3)
    actual_quantity = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(requested_quantity__gt=0), name="order_item_requested_positive"),
            models.CheckConstraint(condition=Q(actual_quantity__isnull=True) | Q(actual_quantity__gt=0), name="order_item_actual_positive"),
            models.CheckConstraint(condition=Q(unit_price__gte=0), name="order_item_price_nonnegative"),
            models.CheckConstraint(condition=Q(line_total__gte=0), name="order_item_total_nonnegative"),
        ]
        ordering = ["created_at"]

    @property
    def effective_quantity(self) -> Decimal:
        return self.actual_quantity if self.actual_quantity is not None else self.requested_quantity

    def clean(self) -> None:
        super().clean()
        if self.order_id and self.product_id and self.order.organization_id != self.product.organization_id:
            raise ValidationError({"product": "El producto debe pertenecer a la organización del pedido."})

    def save(self, *args, **kwargs) -> None:
        self.line_total = self.effective_quantity * self.unit_price
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.order.public_id} · {self.product.name}"


class AuditEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.PROTECT, related_name="audit_events")
    sequence = models.PositiveBigIntegerField()
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="market_audit_events")
    action = models.CharField(max_length=80)
    entity_type = models.CharField(max_length=80)
    entity_id = models.CharField(max_length=80)
    payload = models.JSONField(default=dict)
    previous_hash = models.CharField(max_length=64, blank=True)
    event_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "sequence"], name="uniq_audit_sequence_per_org")]
        ordering = ["organization_id", "sequence"]

    def save(self, *args, **kwargs) -> None:
        if self.pk and AuditEvent.objects.filter(pk=self.pk).exists():
            raise ValidationError("Los eventos de auditoría son inmutables.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Los eventos de auditoría no se pueden eliminar.")

    def __str__(self) -> str:
        return f"{self.organization.slug} · {self.sequence} · {self.action}"