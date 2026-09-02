from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import AuditEvent, InventoryLot, Membership, Order, Organization, Product


class MarketApiTests(APITestCase):
    def setUp(self):
        self.camila = User.objects.create_user(username="camila", password="safe-test-password", first_name="Camila")
        self.carmelo = User.objects.create_user(username="carmelo", password="safe-test-password", first_name="Carmelo")
        self.organization = Organization.objects.create(name="Mercado Piloto", slug="mercado-piloto")
        self.other_organization = Organization.objects.create(name="Otro Mercado", slug="otro-mercado")
        Membership.objects.create(user=self.camila, organization=self.organization, role=Membership.Role.MANAGER)
        Membership.objects.create(user=self.carmelo, organization=self.organization, role=Membership.Role.OPERATOR)
        Membership.objects.create(user=self.camila, organization=self.other_organization, role=Membership.Role.VIEWER)
        self.token = Token.objects.create(user=self.camila)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def order_payload(self, product, *, key="remote-order-key", customer="Cliente piloto"):
        return {
            "public_id": "FM-API-0001",
            "customer_name": customer,
            "status": "confirmed",
            "payment_method": "pending",
            "source": "operator",
            "notes": "Retiro · pedido remoto de prueba",
            "idempotency_key": key,
            "items": [
                {
                    "product": str(product.id),
                    "requested_quantity": "1.250",
                    "unit_price": "4500.00",
                }
            ],
        }

    def test_health_is_public(self):
        self.client.credentials()
        response = self.client.get(reverse("health"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["version"], "0.3.0-mvp")

    def test_login_returns_session_without_password_and_requires_org_choice(self):
        self.client.credentials()
        response = self.client.post(
            reverse("pilot-login"),
            {"username": "camila", "password": "safe-test-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["token"])
        self.assertNotIn("password", str(response.data).lower())
        self.assertEqual(len(response.data["memberships"]), 2)
        self.assertIsNone(response.data["default_organization"])
        self.assertGreater(timezone.datetime.fromisoformat(response.data["expires_at"]), timezone.now())

    def test_login_rejects_invalid_credentials_with_friendly_message(self):
        self.client.credentials()
        response = self.client.post(
            reverse("pilot-login"),
            {"username": "camila", "password": "incorrecta"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("incorrectos", str(response.data).lower())

    def test_login_rejects_missing_credentials_without_rotating_token(self):
        self.client.credentials()
        original_key = self.token.key
        response = self.client.post(reverse("pilot-login"), {}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("ingresa usuario y contraseña", str(response.data).lower())
        self.assertTrue(Token.objects.filter(key=original_key, user=self.camila).exists())

    def test_expired_token_is_rejected(self):
        Token.objects.filter(pk=self.token.pk).update(created=timezone.now() - timedelta(hours=13))
        response = self.client.get(reverse("me"))
        self.assertEqual(response.status_code, 401)
        self.assertIn("venció", str(response.data).lower())
        repeated = self.client.get(reverse("me"))
        self.assertEqual(repeated.status_code, 401)

    def test_logout_invalidates_token(self):
        response = self.client.post(reverse("pilot-logout"))
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Token.objects.filter(user=self.camila).exists())

    def test_password_change_requires_current_password_and_preserves_session_on_error(self):
        response = self.client.post(
            reverse("change-password"),
            {
                "current_password": "incorrecta",
                "new_password": "new-safe-test-password-2026",
                "new_password_confirmation": "new-safe-test-password-2026",
            },
            format="json",
            HTTP_X_ORGANIZATION_ID=str(self.organization.id),
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertTrue(self.camila.check_password("safe-test-password"))
        self.assertTrue(Token.objects.filter(key=self.token.key).exists())

    def test_password_change_revokes_tokens_and_records_audit(self):
        new_password = "new-safe-test-password-2026"
        response = self.client.post(
            reverse("change-password"),
            {
                "current_password": "safe-test-password",
                "new_password": new_password,
                "new_password_confirmation": new_password,
            },
            format="json",
            HTTP_X_ORGANIZATION_ID=str(self.organization.id),
        )
        self.assertEqual(response.status_code, 204, response.data)
        self.camila.refresh_from_db()
        self.assertTrue(self.camila.check_password(new_password))
        self.assertFalse(Token.objects.filter(user=self.camila).exists())
        event = AuditEvent.objects.get(action="account.password_changed")
        self.assertEqual(event.organization, self.organization)
        self.assertEqual(event.actor, self.camila)
        self.assertTrue(event.payload["tokens_revoked"])

    def test_login_rotates_previous_token_and_invalidates_old_credentials(self):
        first_key = self.token.key
        self.client.credentials()
        response = self.client.post(
            reverse("pilot-login"),
            {"username": "camila", "password": "safe-test-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        second_key = response.data["token"]
        self.assertNotEqual(first_key, second_key)
        self.assertFalse(Token.objects.filter(key=first_key).exists())
        self.assertEqual(Token.objects.filter(user=self.camila).count(), 1)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {first_key}")
        self.assertEqual(self.client.get(reverse("me")).status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {second_key}")
        self.assertEqual(self.client.get(reverse("me")).status_code, 200)

    def test_connection_summary_is_scoped_and_operator_friendly(self):
        product = Product.objects.create(
            organization=self.organization,
            sku="TOM-001",
            name="Tomate",
            sale_unit=Product.SaleUnit.KILOGRAM,
            price=Decimal("1990.00"),
        )
        InventoryLot.objects.create(
            organization=self.organization,
            product=product,
            received_at="2026-08-02",
            quantity_received=Decimal("10.000"),
            quantity_available=Decimal("8.500"),
            unit_cost=Decimal("900.00"),
        )
        Product.objects.create(
            organization=self.other_organization,
            sku="FOREIGN-001",
            name="Producto ajeno",
            sale_unit=Product.SaleUnit.UNIT,
            price=Decimal("999.00"),
        )
        response = self.client.get(
            reverse("connection-summary"),
            HTTP_X_ORGANIZATION_ID=str(self.organization.id),
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["organization"]["name"], "Mercado Piloto")
        self.assertEqual(response.data["membership"]["role"], Membership.Role.MANAGER)
        self.assertEqual(response.data["counts"]["products"], 1)
        self.assertEqual(response.data["counts"]["inventory_lots"], 1)
        self.assertEqual(response.data["product_preview"][0]["name"], "Tomate")
        self.assertNotIn("Producto ajeno", str(response.data))

    def test_multiple_memberships_require_explicit_organization(self):
        response = self.client.get("/api/v1/products/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("organization", str(response.data))

    def test_manager_creates_product_inside_selected_organization_and_audits(self):
        response = self.client.post(
            "/api/v1/products/",
            {"sku": "TOM-001", "name": "Tomate", "category": "Verduras", "sale_unit": "kg", "price": "1990.00"},
            format="json",
            HTTP_X_ORGANIZATION_ID=str(self.organization.id),
        )
        self.assertEqual(response.status_code, 201, response.data)
        product = Product.objects.get()
        self.assertEqual(product.organization, self.organization)
        event = AuditEvent.objects.get()
        self.assertEqual(event.action, "product.created")
        self.assertEqual(event.organization, self.organization)

    def test_active_product_filter_is_scoped_to_selected_organization(self):
        Product.objects.create(
            organization=self.organization,
            sku="ACTIVE",
            name="Producto activo",
            sale_unit=Product.SaleUnit.UNIT,
            price=Decimal("1000.00"),
            is_active=True,
        )
        Product.objects.create(
            organization=self.organization,
            sku="INACTIVE",
            name="Producto inactivo",
            sale_unit=Product.SaleUnit.UNIT,
            price=Decimal("900.00"),
            is_active=False,
        )
        Product.objects.create(
            organization=self.other_organization,
            sku="FOREIGN",
            name="Producto extranjero",
            sale_unit=Product.SaleUnit.UNIT,
            price=Decimal("800.00"),
            is_active=True,
        )
        response = self.client.get(
            "/api/v1/products/?is_active=true",
            HTTP_X_ORGANIZATION_ID=str(self.organization.id),
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["sku"], "ACTIVE")

    def test_operator_can_create_order_but_cannot_create_product(self):
        product = Product.objects.create(
            organization=self.organization,
            sku="PAL-001",
            name="Palta",
            sale_unit=Product.SaleUnit.KILOGRAM,
            price=Decimal("4500.00"),
        )
        operator_token = Token.objects.create(user=self.carmelo)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {operator_token.key}")
        headers = {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}
        blocked = self.client.post(
            "/api/v1/products/",
            {"sku": "BAN-001", "name": "Banana", "sale_unit": "kg", "price": "1600.00"},
            format="json",
            **headers,
        )
        self.assertEqual(blocked.status_code, 403)
        created = self.client.post(
            "/api/v1/orders/",
            self.order_payload(product),
            format="json",
            **headers,
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["total"], "5625.00")
        self.assertEqual(Order.objects.get().created_by, self.carmelo)

    def test_order_creation_replays_same_idempotency_key_without_duplicates(self):
        product = Product.objects.create(
            organization=self.organization,
            sku="PAL-002",
            name="Palta hass",
            sale_unit=Product.SaleUnit.KILOGRAM,
            price=Decimal("4500.00"),
        )
        headers = {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}
        payload = self.order_payload(product, key="stable-browser-request")
        first = self.client.post("/api/v1/orders/", payload, format="json", **headers)
        second = self.client.post("/api/v1/orders/", payload, format="json", **headers)
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(second.headers["X-Idempotent-Replay"], "true")
        self.assertEqual(Order.objects.filter(organization=self.organization).count(), 1)
        self.assertEqual(AuditEvent.objects.filter(organization=self.organization, action="order.created").count(), 1)

    def test_reused_idempotency_key_with_different_payload_returns_conflict(self):
        product = Product.objects.create(
            organization=self.organization,
            sku="PAL-003",
            name="Palta fuerte",
            sale_unit=Product.SaleUnit.KILOGRAM,
            price=Decimal("4500.00"),
        )
        headers = {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}
        first = self.client.post(
            "/api/v1/orders/",
            self.order_payload(product, key="collision-key", customer="Cliente A"),
            format="json",
            **headers,
        )
        conflicting = self.client.post(
            "/api/v1/orders/",
            self.order_payload(product, key="collision-key", customer="Cliente B"),
            format="json",
            **headers,
        )
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(conflicting.status_code, 409, conflicting.data)
        self.assertIn("pedido diferente", str(conflicting.data).lower())
        self.assertEqual(Order.objects.filter(organization=self.organization).count(), 1)

    def test_organization_scope_hides_foreign_records(self):
        Product.objects.create(
            organization=self.other_organization,
            sku="SECRET",
            name="Producto ajeno",
            sale_unit=Product.SaleUnit.UNIT,
            price=Decimal("1.00"),
        )
        response = self.client.get(
            "/api/v1/products/",
            HTTP_X_ORGANIZATION_ID=str(self.organization.id),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

    def test_audit_chain_links_events_and_is_immutable(self):
        headers = {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}
        for sku, name in [("TOM-002", "Tomate pera"), ("TOM-003", "Tomate cherry")]:
            response = self.client.post(
                "/api/v1/products/",
                {"sku": sku, "name": name, "sale_unit": "kg", "price": "2100.00"},
                format="json",
                **headers,
            )
            self.assertEqual(response.status_code, 201, response.data)
        first, second = AuditEvent.objects.order_by("sequence")
        self.assertEqual(first.sequence, 1)
        self.assertEqual(second.sequence, 2)
        self.assertEqual(second.previous_hash, first.event_hash)
        second.action = "tampered"
        with self.assertRaises(ValidationError):
            second.save()

    def test_inventory_validation_returns_operator_friendly_error(self):
        product = Product.objects.create(
            organization=self.organization,
            sku="LEC-001",
            name="Lechuga",
            sale_unit=Product.SaleUnit.UNIT,
            price=Decimal("1200.00"),
        )
        response = self.client.post(
            "/api/v1/inventory-lots/",
            {
                "product": str(product.id),
                "received_at": "2026-08-02",
                "best_before": "2026-08-01",
                "quantity_received": "10.000",
                "quantity_available": "12.000",
                "unit_cost": "500.00",
                "quality": "good",
                "status": "active",
            },
            format="json",
            HTTP_X_ORGANIZATION_ID=str(self.organization.id),
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("cantidad disponible", str(response.data).lower())
