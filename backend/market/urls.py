from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AuditEventViewSet, HealthView, InventoryLotViewSet, MeView, OrderViewSet, OrganizationViewSet, ProductViewSet

router = DefaultRouter()
router.register("organizations", OrganizationViewSet, basename="organization")
router.register("products", ProductViewSet, basename="product")
router.register("inventory-lots", InventoryLotViewSet, basename="inventory-lot")
router.register("orders", OrderViewSet, basename="order")
router.register("audit-events", AuditEventViewSet, basename="audit-event")

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("me/", MeView.as_view(), name="me"),
    path("", include(router.urls)),
    path("auth/", include("rest_framework.urls")),
]
