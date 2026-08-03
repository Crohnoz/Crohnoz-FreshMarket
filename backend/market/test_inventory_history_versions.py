from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import InventoryLot, InventoryMovement, Membership, Organization, Product


class InventoryHistoryVersionTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="history-version", password="safe-test-password")
        self.organization = Organization.objects.create(name="Mercado Historial", slug="mercado-historial")
        Membership.objects.create(user=self.user, organization=self.organization, role=Membership.Role.OPERATOR)
        product = Product.objects.create(
            organization=self.organization,
            sku="HIS-001",
            name="Tomate historial",
            sale_unit=Product.SaleUnit.KILOGRAM,
            price=Decimal("1800.00"),
        )
        self.lot = InventoryLot.objects.create(
            organization=self.organization,
            product=product,
            received_at="2026-08-03",
            best_before="2026-08-08",
            quantity_received=Decimal("5.000"),
            quantity_available=Decimal("5.000"),
            unit_cost=Decimal("900.00"),
        )
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    @property
    def organization_header(self):
        return {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}

    def move(self, *, key, version, quantity, movement_type):
        return self.client.post(
            "/api/v1/inventory-movements/",
            {
                "lot": str(self.lot.id),
                "movement_type": movement_type,
                "quantity": quantity,
                "reason": "Prueba de versión histórica",
            },
            format="json",
            HTTP_IF_MATCH=str(version),
            HTTP_IDEMPOTENCY_KEY=key,
            **self.organization_header,
        )

    def test_each_movement_keeps_the_resulting_lot_version(self):
        first = self.move(
            key="history-version-001",
            version=1,
            quantity="1.000",
            movement_type=InventoryMovement.MovementType.CONSUMPTION,
        )
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data["movement"]["lot_version"], 2)

        second = self.move(
            key="history-version-002",
            version=2,
            quantity="0.500",
            movement_type=InventoryMovement.MovementType.WASTE,
        )
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual(second.data["movement"]["lot_version"], 3)

        listing = self.client.get(
            f"/api/v1/inventory-movements/?lot={self.lot.id}",
            **self.organization_header,
        )
        self.assertEqual(listing.status_code, 200, listing.data)
        records = listing.data.get("results", listing.data)
        self.assertEqual([record["lot_version"] for record in records], [3, 2])

        first_record = InventoryMovement.objects.order_by("created_at").first()
        self.assertEqual(first_record.lot_version, 2)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.version, 3)