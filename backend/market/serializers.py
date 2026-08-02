from __future__ import annotations

from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import serializers

from .models import AuditEvent, InventoryLot, Membership, Order, OrderItem, Organization, Product
from .services import recalculate_order_total


class MembershipSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    organization_slug = serializers.CharField(source="organization.slug", read_only=True)

    class Meta:
        model = Membership
        fields = ["id", "organization", "organization_name", "organization_slug", "role", "is_active"]


class UserSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name"]


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name", "slug", "status", "created_at", "updated_at", "version"]
        read_only_fields = ["id", "created_at", "updated_at", "version"]


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "sku", "name", "category", "sale_unit", "price", "is_active", "created_at", "updated_at", "version"]
        read_only_fields = ["id", "created_at", "updated_at", "version"]


class InventoryLotSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = InventoryLot
        fields = [
            "id", "product", "product_name", "received_at", "best_before", "quantity_received",
            "quantity_available", "unit_cost", "quality", "status", "notes", "created_at", "updated_at", "version",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "version"]

    def validate_product(self, product):
        organization = self.context["organization"]
        if product.organization_id != organization.id:
            raise serializers.ValidationError("El producto no pertenece a la organización activa.")
        return product

    def validate(self, attrs):
        received = attrs.get("quantity_received", getattr(self.instance, "quantity_received", None))
        available = attrs.get("quantity_available", getattr(self.instance, "quantity_available", None))
        received_at = attrs.get("received_at", getattr(self.instance, "received_at", None))
        best_before = attrs.get("best_before", getattr(self.instance, "best_before", None))
        if received is not None and received < 0:
            raise serializers.ValidationError({"quantity_received": "La cantidad recibida no puede ser negativa."})
        if available is not None and available < 0:
            raise serializers.ValidationError({"quantity_available": "La cantidad disponible no puede ser negativa."})
        if received is not None and available is not None and available > received:
            raise serializers.ValidationError({"quantity_available": "No puede superar la cantidad recibida."})
        if received_at and best_before and best_before < received_at:
            raise serializers.ValidationError({"best_before": "La fecha preferente no puede ser anterior a la recepción."})
        return attrs


class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = OrderItem
        fields = [
            "id", "product", "product_name", "requested_quantity", "actual_quantity", "unit_price", "line_total",
        ]
        read_only_fields = ["id", "line_total"]

    def validate_product(self, product):
        organization = self.context["organization"]
        if product.organization_id != organization.id:
            raise serializers.ValidationError("El producto no pertenece a la organización activa.")
        return product

    def validate(self, attrs):
        requested = attrs.get("requested_quantity")
        actual = attrs.get("actual_quantity")
        unit_price = attrs.get("unit_price")
        if requested is not None and requested <= 0:
            raise serializers.ValidationError({"requested_quantity": "La cantidad debe ser mayor que cero."})
        if actual is not None and actual <= 0:
            raise serializers.ValidationError({"actual_quantity": "La cantidad real debe ser mayor que cero."})
        if unit_price is not None and unit_price < 0:
            raise serializers.ValidationError({"unit_price": "El precio no puede ser negativo."})
        return attrs


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)
    created_by = UserSummarySerializer(read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "public_id", "customer_name", "status", "payment_method", "source", "total", "notes",
            "idempotency_key", "created_by", "items", "created_at", "updated_at", "version",
        ]
        read_only_fields = ["id", "total", "created_by", "created_at", "updated_at", "version"]

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items")
        order = Order.objects.create(**validated_data)
        for item_data in items_data:
            item = OrderItem(order=order, **item_data)
            item.full_clean()
            item.save()
        recalculate_order_total(order)
        return order

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.full_clean()
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                item = OrderItem(order=instance, **item_data)
                item.full_clean()
                item.save()
            recalculate_order_total(instance)
        return instance


class AuditEventSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True)

    class Meta:
        model = AuditEvent
        fields = [
            "id", "sequence", "actor", "actor_username", "action", "entity_type", "entity_id",
            "payload", "previous_hash", "event_hash", "created_at",
        ]
        read_only_fields = fields
