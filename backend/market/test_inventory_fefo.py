from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import InventoryLot, InventoryMovement, Membership, Organization, Product


class InventoryFefoTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="operador-fefo", password="safe-test-password")
        self.organization = Organization.objects.create(name="Mercado FEFO", slug="mercado-fefo")
        Membership.objects.create(user=self.user, organization=self.organization, role=Membership.Role.OPERATOR)
        self.product = Product.objects.create(
            organization=self.organization,
            sku="PAL-FEFO",
            name="Palta",
            sale_unit=Product.SaleUnit.KILOGRAM,
            price=Decimal("4200.00"),
        )
        self.first = InventoryLot.objects.create(
            organization=self.organization,
            product=self.product,
            received_at="2026-08-01",
            best_before="2026-08-05",
            quantity_received=Decimal("2.000"),
            quantity_available=Decimal("2.000"),
            unit_cost=Decimal("2200.00"),
        )
        self.later = InventoryLot.objects.create(
            organization=self.organization,
            product=self.product,
            received_at="2026-08-02",
            best_before="2026-08-09",
            quantity_received=Decimal("4.000"),
            quantity_available=Decimal("4.000"),
            unit_cost=Decimal("2100.00"),
        )
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    @property
    def organization_header(self):
        return {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}

    def consume(self, lot, *, key, version=1, quantity="1.000"):
        return self.client.post(
            "/api/v1/inventory-movements/",
            {
                "lot": str(lot.id),
                "movement_type": InventoryMovement.MovementType.CONSUMPTION,
                "quantity": quantity,
                "reason": "Preparación de pedido",
                "reference": "FM-FEFO",
            },
            format="json",
            HTTP_IF_MATCH=str(version),
            HTTP_IDEMPOTENCY_KEY=key,
            **self.organization_header,
        )

    def test_later_lot_is_rejected_while_earlier_fefo_lot_has_stock(self):
        response = self.consume(self.later, key="fefo-later-rejected")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("lote fefo", str(response.data).lower())
        self.first.refresh_from_db()
        self.later.refresh_from_db()
        self.assertEqual(self.first.quantity_available, Decimal("2.000"))
        self.assertEqual(self.later.quantity_available, Decimal("4.000"))
        self.assertEqual(InventoryMovement.objects.count(), 0)

    def test_consumption_moves_to_next_lot_after_first_is_depleted(self):
        first = self.consume(self.first, key="fefo-first-consume", quantity="2.000")
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data["lot"]["status"], InventoryLot.Status.DEPLETED)

        later = self.consume(self.later, key="fefo-later-consume", quantity="1.500")
        self.assertEqual(later.status_code, 201, later.data)
        self.assertEqual(later.data["lot"]["quantity_available"], "2.500")

    def test_idempotent_replay_survives_later_fefo_changes(self):
        first = self.consume(self.first, key="fefo-replay-stable", quantity="1.000")
        self.assertEqual(first.status_code, 201, first.data)

        earlier_new = InventoryLot.objects.create(
            organization=self.organization,
            product=self.product,
            received_at="2026-07-31",
            best_before="2026-08-03",
            quantity_received=Decimal("1.000"),
            quantity_available=Decimal("1.000"),
            unit_cost=Decimal("2300.00"),
        )
        replay = self.consume(self.first, key="fefo-replay-stable", quantity="1.000")
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(replay.headers["X-Idempotent-Replay"], "true")
        self.assertEqual(InventoryMovement.objects.filter(lot=self.first).count(), 1)
        earlier_new.refresh_from_db()
        self.assertEqual(earlier_new.quantity_available, Decimal("1.000"))

    def test_damaged_earlier_lot_does_not_block_usable_stock(self):
        self.first.quality = InventoryLot.Quality.DAMAGED
        self.first.save(update_fields=["quality", "updated_at"])
        response = self.consume(self.later, key="fefo-skip-damaged", quantity="1.000")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["lot"]["quantity_available"], "3.000")