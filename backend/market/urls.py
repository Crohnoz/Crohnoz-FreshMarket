from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .inventory_api import InventoryMovementViewSet
from .team_api import TeamMemberView, TeamView
from .views import (
    AuditEventViewSet,
    ChangePasswordView,
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
router.register("inventory-movements", InventoryMovementViewSet, basename="inventory-movement")
router.register("orders", OrderViewSet, basename="order")
router.register("audit-events", AuditEventViewSet, basename="audit-event")

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("auth/login/", LoginView.as_view(), name="pilot-login"),
    path("auth/logout/", LogoutView.as_view(), name="pilot-logout"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("me/", MeView.as_view(), name="me"),
    path("connection-summary/", ConnectionSummaryView.as_view(), name="connection-summary"),
    path("team/", TeamView.as_view(), name="team"),
    path("team/<uuid:membership_id>/", TeamMemberView.as_view(), name="team-member"),
    path("", include(router.urls)),
    path("auth/browser/", include("rest_framework.urls")),
]
