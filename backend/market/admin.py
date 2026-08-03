from django.contrib import admin

from .models import AuditEvent, InventoryLot, InventoryMovement, Membership, Order, OrderItem, Organization, Product


class ImmutableAdminMixin:
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "status", "updated_at")
    search_fields = ("name", "slug")
    list_filter = ("status",)


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "organization", "role", "is_active")
    list_filter = ("role", "is_active", "organization")
    autocomplete_fields = ("user", "organization")


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "sku", "sale_unit", "price", "is_active")
    list_filter = ("organization", "sale_unit", "is_active")
    search_fields = ("name", "sku")


@admin.register(InventoryLot)
class InventoryLotAdmin(ImmutableAdminMixin, admin.ModelAdmin):
    list_display = ("product", "organization", "received_at", "best_before", "quantity_available", "quality", "status", "version")
    list_filter = ("organization", "quality", "status")
    search_fields = ("product__name", "product__sku", "notes")
    readonly_fields = [field.name for field in InventoryLot._meta.fields]


@admin.register(InventoryMovement)
class InventoryMovementAdmin(ImmutableAdminMixin, admin.ModelAdmin):
    list_display = (
        "organization", "lot", "movement_type", "quantity_delta", "quantity_before",
        "quantity_after", "created_by", "created_at",
    )
    list_filter = ("organization", "movement_type", "created_at")
    search_fields = ("lot__product__name", "reason", "reference", "idempotency_key", "created_by__username")
    readonly_fields = [field.name for field in InventoryMovement._meta.fields]


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ("line_total",)


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("public_id", "organization", "customer_name", "status", "payment_method", "total", "created_at")
    list_filter = ("organization", "status", "payment_method", "source")
    search_fields = ("public_id", "customer_name")
    readonly_fields = ("total",)
    inlines = (OrderItemInline,)


@admin.register(AuditEvent)
class AuditEventAdmin(ImmutableAdminMixin, admin.ModelAdmin):
    list_display = ("organization", "sequence", "action", "entity_type", "entity_id", "actor", "created_at")
    list_filter = ("organization", "action", "entity_type")
    search_fields = ("entity_id", "event_hash", "actor__username")
    readonly_fields = [field.name for field in AuditEvent._meta.fields]