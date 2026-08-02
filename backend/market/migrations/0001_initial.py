# Generated manually for the first Crohnoz Fresh Market backend vertical slice.
from decimal import Decimal
import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    initial = True

    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.CreateModel(
            name="Organization",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("name", models.CharField(max_length=120)),
                ("slug", models.SlugField(max_length=120, unique=True)),
                ("status", models.CharField(choices=[("active", "Activa"), ("suspended", "Suspendida"), ("archived", "Archivada")], default="active", max_length=20)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="Membership",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("role", models.CharField(choices=[("owner", "Propietario/a"), ("manager", "Administrador/a"), ("operator", "Operador/a"), ("viewer", "Solo lectura")], default="operator", max_length=20)),
                ("is_active", models.BooleanField(default=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="memberships", to="market.organization")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="market_memberships", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["organization__name", "user__username"]},
        ),
        migrations.CreateModel(
            name="Product",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("sku", models.CharField(max_length=64)),
                ("name", models.CharField(max_length=160)),
                ("category", models.CharField(blank=True, max_length=80)),
                ("sale_unit", models.CharField(choices=[("kg", "Kilogramo"), ("unit", "Unidad"), ("bundle", "Paquete")], max_length=16)),
                ("price", models.DecimalField(decimal_places=2, max_digits=12)),
                ("is_active", models.BooleanField(default=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="products", to="market.organization")),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="InventoryLot",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("received_at", models.DateField()),
                ("best_before", models.DateField(blank=True, null=True)),
                ("quantity_received", models.DecimalField(decimal_places=3, max_digits=12)),
                ("quantity_available", models.DecimalField(decimal_places=3, max_digits=12)),
                ("unit_cost", models.DecimalField(decimal_places=2, max_digits=12)),
                ("quality", models.CharField(choices=[("good", "Buena"), ("review", "Revisar"), ("damaged", "Dañada")], default="good", max_length=16)),
                ("status", models.CharField(choices=[("active", "Activo"), ("depleted", "Agotado"), ("discarded", "Descartado")], default="active", max_length=16)),
                ("notes", models.CharField(blank=True, max_length=240)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="inventory_lots", to="market.organization")),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="lots", to="market.product")),
            ],
            options={"ordering": ["best_before", "received_at", "created_at"]},
        ),
        migrations.CreateModel(
            name="Order",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("public_id", models.CharField(max_length=40)),
                ("customer_name", models.CharField(max_length=160)),
                ("status", models.CharField(choices=[("draft", "Borrador"), ("confirmed", "Confirmado"), ("preparing", "Preparando"), ("ready", "Listo"), ("delivered", "Entregado"), ("cancelled", "Cancelado")], default="draft", max_length=20)),
                ("payment_method", models.CharField(choices=[("pending", "Pendiente"), ("cash", "Efectivo"), ("transfer", "Transferencia"), ("credit", "Fiado")], default="pending", max_length=20)),
                ("source", models.CharField(choices=[("operator", "Operador"), ("storefront", "Tienda"), ("import", "Importación")], default="operator", max_length=20)),
                ("total", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12)),
                ("notes", models.CharField(blank=True, max_length=500)),
                ("idempotency_key", models.CharField(blank=True, max_length=96)),
                ("created_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="market_orders", to=settings.AUTH_USER_MODEL)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="orders", to="market.organization")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="OrderItem",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("requested_quantity", models.DecimalField(decimal_places=3, max_digits=12)),
                ("actual_quantity", models.DecimalField(blank=True, decimal_places=3, max_digits=12, null=True)),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=12)),
                ("line_total", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12)),
                ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="market.order")),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="order_items", to="market.product")),
            ],
            options={"ordering": ["created_at"]},
        ),
        migrations.CreateModel(
            name="AuditEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("sequence", models.PositiveBigIntegerField()),
                ("action", models.CharField(max_length=80)),
                ("entity_type", models.CharField(max_length=80)),
                ("entity_id", models.CharField(max_length=80)),
                ("payload", models.JSONField(default=dict)),
                ("previous_hash", models.CharField(blank=True, max_length=64)),
                ("event_hash", models.CharField(max_length=64, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="market_audit_events", to=settings.AUTH_USER_MODEL)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="audit_events", to="market.organization")),
            ],
            options={"ordering": ["organization_id", "sequence"]},
        ),
        migrations.AddConstraint(model_name="membership", constraint=models.UniqueConstraint(fields=("organization", "user"), name="uniq_market_membership")),
        migrations.AddConstraint(model_name="product", constraint=models.UniqueConstraint(fields=("organization", "sku"), name="uniq_product_sku_per_org")),
        migrations.AddConstraint(model_name="product", constraint=models.CheckConstraint(condition=Q(("price__gte", 0)), name="product_price_nonnegative")),
        migrations.AddConstraint(model_name="inventorylot", constraint=models.CheckConstraint(condition=Q(("quantity_received__gte", 0)), name="lot_received_nonnegative")),
        migrations.AddConstraint(model_name="inventorylot", constraint=models.CheckConstraint(condition=Q(("quantity_available__gte", 0)), name="lot_available_nonnegative")),
        migrations.AddConstraint(model_name="inventorylot", constraint=models.CheckConstraint(condition=Q(("quantity_available__lte", models.F("quantity_received"))), name="lot_available_not_above_received")),
        migrations.AddConstraint(model_name="inventorylot", constraint=models.CheckConstraint(condition=Q(("unit_cost__gte", 0)), name="lot_cost_nonnegative")),
        migrations.AddConstraint(model_name="order", constraint=models.UniqueConstraint(fields=("organization", "public_id"), name="uniq_order_public_id_per_org")),
        migrations.AddConstraint(model_name="order", constraint=models.UniqueConstraint(condition=~Q(("idempotency_key", "")), fields=("organization", "idempotency_key"), name="uniq_order_idempotency_per_org")),
        migrations.AddConstraint(model_name="order", constraint=models.CheckConstraint(condition=Q(("total__gte", 0)), name="order_total_nonnegative")),
        migrations.AddConstraint(model_name="orderitem", constraint=models.CheckConstraint(condition=Q(("requested_quantity__gt", 0)), name="order_item_requested_positive")),
        migrations.AddConstraint(model_name="orderitem", constraint=models.CheckConstraint(condition=Q(("actual_quantity__isnull", True), ("actual_quantity__gt", 0), _connector="OR"), name="order_item_actual_positive")),
        migrations.AddConstraint(model_name="orderitem", constraint=models.CheckConstraint(condition=Q(("unit_price__gte", 0)), name="order_item_price_nonnegative")),
        migrations.AddConstraint(model_name="orderitem", constraint=models.CheckConstraint(condition=Q(("line_total__gte", 0)), name="order_item_total_nonnegative")),
        migrations.AddConstraint(model_name="auditevent", constraint=models.UniqueConstraint(fields=("organization", "sequence"), name="uniq_audit_sequence_per_org")),
    ]
