from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import AuditEvent, InventoryLot, Membership, Order, Organization, Product
from .services import record_audit_event


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

    def test_health_is_public(self):
        self.client.credentials()
        response = self.client.get(reverse("health"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["version"], "0.2.0-mvp")

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

    def test_login_rejects_missing_credentials_without_rotating_token(self):
        self.client.credentials()
        original_key = self.token.key
        response = self.client.post(reverse("pilot-login"), {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("ingresa usuario y contraseña", str(response.data).lower())
        self.assertTrue(Token.objects.filter(key=original_key, user=self.camila).exists())
        self.assertEqual(Token.objects.filter(user=self.camila).count(), 1)

    def test_login_rejects_invalid_credentials_with_friendly_message(self):
        self.client.credentials()
        response = self.client.post(
            reverse("pilot-login"),
            {"username": "camila", "password": "incorrecta"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("incorrectos", str(response.data).lower())

    def test_login_rotates_previous_token_and_invalidates_old_credentials(self):
        self.client.credentials()
        original_key = self.token.key
        first = self.client.post(
            reverse("pilot-login"),
            {"username": "camila", "password": "safe-test-password"},
            format="json",
        )
        self.assertEqual(first.status_code, 200, first.data)
        first_key = first.data["token"]
        self.assertNotEqual(first_key, original_key)
        self.assertFalse(Token.objects.filter(key=original_key).exists())
        self.assertEqual(Token.objects.filter(user=self.camila).count(), 1)

        second = self.client.post(
            reverse("pilot-login"),
            {"username": "camila", "password": "safe-test-password"},
            format="json",
        )
        self.assertEqual(second.status_code, 200, second.data)
        second_key = second.data["token"]
        self.assertNotEqual(second_key, first_key)
        self.assertFalse(Token.objects.filter(key=first_key).exists())
        self.assertEqual(Token.objects.filter(user=self.camila).count(), 1)

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {first_key}")
        self.assertEqual(self.client.get(reverse("me")).status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {second_key}")
        self.assertEqual(self.client.get(reverse("me")).status_code, 200)

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
        foreign_product = Product.objects.create(
            organization=self.other_organization,
            sku="SECRET",
            name="Producto ajeno",
            sale_unit=Product.SaleUnit.UNIT,
            price=Decimal("1.00"),
        )
        InventoryLot.objects.create(
            organization=self.other_organization,
            product=foreign_product,
            received_at="2026-08-02",
            quantity_received=Decimal("50.000"),
            quantity_available=Decimal("50.000"),
            unit_cost=Decimal("1.00"),
        )
        foreign_order = Order.objects.create(
            organization=self.other_organization,
            public_id="FOREIGN-1",
            customer_name="Cliente ajeno",
            created_by=self.camila,
        )
        record_audit_event(
            organization=self.other_organization,
            actor=self.camila,
            action="order.created",
            entity_type=foreign_order._meta.label_lower,
            entity_id=str(foreign_order.pk),
            payload={"public_id": foreign_order.public_id},
        )

        response = self.client.get(
            reverse("connection-summary"),
            HTTP_X_ORGANIZATION_ID=str(self.organization.id),
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["organization"]["name"], "Mercado Piloto")
        self.assertEqual(response.data["membership"]["role"], Membership.Role.MANAGER)
        self.assertEqual(response.data["counts"], {
            "products": 1,
            "inventory_lots": 1,
            "orders": 0,
            "audit_events": 0,
        })
        self.assertEqual([item["name"] for item in response.data["product_preview"]], ["Tomate"])
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
            {
                "public_id": "FM-0001",
                "customer_name": "Cliente piloto",
                "status": "confirmed",
                "payment_method": "cash",
                "source": "operator",
                "items": [{"product": str(product.id), "requested_quantity": "1.250", "unit_price": "4500.00"}],
            },
            format="json",
            **headers,
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["total"], "5625.00")
        self.assertEqual(Order.objects.get().created_by, self.carmelo)

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
