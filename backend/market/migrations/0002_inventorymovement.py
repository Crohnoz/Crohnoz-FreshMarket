# Generated for the remote inventory movement ledger.
import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [
        ("market", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="InventoryMovement",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("lot_version", models.PositiveIntegerField()),
                ("movement_type", models.CharField(choices=[("consumption", "Consumo"), ("waste", "Merma"), ("adjustment", "Ajuste"), ("supplier_return", "Devolución a proveedor")], max_length=24)),
                ("quantity_delta", models.DecimalField(decimal_places=3, max_digits=12)),
                ("quantity_before", models.DecimalField(decimal_places=3, max_digits=12)),
                ("quantity_after", models.DecimalField(decimal_places=3, max_digits=12)),
                ("reason", models.CharField(max_length=240)),
                ("reference", models.CharField(blank=True, max_length=120)),
                ("idempotency_key", models.CharField(max_length=96)),
                ("request_signature", models.CharField(max_length=64)),
                ("created_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="market_inventory_movements", to=settings.AUTH_USER_MODEL)),
                ("lot", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="movements", to="market.inventorylot")),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="inventory_movements", to="market.organization")),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
        migrations.AddConstraint(
            model_name="inventorymovement",
            constraint=models.UniqueConstraint(fields=("organization", "idempotency_key"), name="uniq_inventory_movement_idempotency_per_org"),
        ),
        migrations.AddConstraint(
            model_name="inventorymovement",
            constraint=models.CheckConstraint(condition=~Q(("quantity_delta", 0)), name="inventory_movement_delta_nonzero"),
        ),
        migrations.AddConstraint(
            model_name="inventorymovement",
            constraint=models.CheckConstraint(condition=Q(("quantity_before__gte", 0)), name="inventory_movement_before_nonnegative"),
        ),
        migrations.AddConstraint(
            model_name="inventorymovement",
            constraint=models.CheckConstraint(condition=Q(("quantity_after__gte", 0)), name="inventory_movement_after_nonnegative"),
        ),
    ]