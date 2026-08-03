from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import Membership, Order, Organization, Product


class RemoteQuantityRuleTests(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username="unit-operator", password="safe-test-password")
        self.organization = Organization.objects.create(name="Mercado Unidades", slug="mercado-unidades")
        Membership.objects.create(user=user, organization=self.organization, role=Membership.Role.OPERATOR)
        self.product = Product.objects.create(
            organization=self.organization,
            sku="LEC-001",
            name="Lechuga",
            category="Verduras",
            sale_unit=Product.SaleUnit.UNIT,
            price=Decimal("1200.00"),
        )
        token = Token.objects.create(user=user)
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Token {token.key}",
            HTTP_X_ORGANIZATION_ID=str(self.organization.id),
        )

    def test_fractional_actual_quantity_is_rejected_for_unit_product(self):
        created = self.client.post(
            "/api/v1/orders/",
            {
                "public_id": "FM-UNIT-001",
                "customer_name": "Cliente unidad",
                "idempotency_key": "create-unit-order-001",
                "items": [{
                    "product": str(self.product.id),
                    "requested_quantity": "2.000",
                    "unit_price": "1200.00",
                }],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        order_id = created.data["id"]
        item_id = created.data["items"][0]["id"]

        started = self.client.post(
            f"/api/v1/orders/{order_id}/start-preparing/",
            {},
            format="json",
            HTTP_IF_MATCH="1",
            HTTP_IDEMPOTENCY_KEY="start-unit-order-001",
        )
        self.assertEqual(started.status_code, 200, started.data)

        response = self.client.post(
            f"/api/v1/orders/{order_id}/confirm-weighing/",
            {"items": [{"id": item_id, "actual_quantity": "1.500"}]},
            format="json",
            HTTP_IF_MATCH="2",
            HTTP_IDEMPOTENCY_KEY="weigh-unit-order-001",
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("número entero", str(response.data).lower())

        order = Order.objects.get(pk=order_id)
        self.assertEqual(order.version, 2)
        self.assertIsNone(order.items.get(pk=item_id).actual_quantity)
