from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AuditEventViewSet,
    ConnectionSummaryView,
    HealthView,
    InventoryLotViewSet,
    LoginView,
    LogoutView,
    MeView,
    OrderViewSet,
    OrganizationViewSet,
    ProductViewSet,
)

router = DefaultRouter()
router.register("organizations", OrganizationViewSet, basename="organization")
router.register("products", ProductViewSet, basename="product")
router.register("inventory-lots", InventoryLotViewSet, basename="inventory-lot")
router.register("orders", OrderViewSet, basename="order")
router.register("audit-events", AuditEventViewSet, basename="audit-event")

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("auth/login/", LoginView.as_view(), name="pilot-login"),
    path("auth/logout/", LogoutView.as_view(), name="pilot-logout"),
    path("me/", MeView.as_view(), name="me"),
    path("connection-summary/", ConnectionSummaryView.as_view(), name="connection-summary"),
    path("", include(router.urls)),
    path("auth/browser/", include("rest_framework.urls")),
]
