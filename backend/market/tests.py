from decimal import Decimal

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import AuditEvent, Membership, Organization, Product


class MarketApiTests(APITestCase):
    def setUp(self):
        self.camila = User.objects.create_user(username="camila", password="safe-test-password")
        self.carmelo = User.objects.create_user(username="carmelo", password="safe-test-password")
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
