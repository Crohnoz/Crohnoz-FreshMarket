from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import AuditEvent, InventoryLot, InventoryMovement, Membership, Organization, Product


class InventoryMovementApiTests(APITestCase):
    def setUp(self):
        self.operator = User.objects.create_user(username="operador-movimientos", password="safe-test-password")
        self.manager = User.objects.create_user(username="manager-movimientos", password="safe-test-password")
        self.organization = Organization.objects.create(name="Mercado Movimientos", slug="mercado-movimientos")
        Membership.objects.create(user=self.operator, organization=self.organization, role=Membership.Role.OPERATOR)
        Membership.objects.create(user=self.manager, organization=self.organization, role=Membership.Role.MANAGER)
        self.product = Product.objects.create(
            organization=self.organization,
            sku="TOM-001",
            name="Tomate",
            category="Verduras",
            sale_unit=Product.SaleUnit.KILOGRAM,
            price=Decimal("1800.00"),
        )
        self.unit_product = Product.objects.create(
            organization=self.organization,
            sku="LEC-001",
            name="Lechuga",
            category="Verduras",
            sale_unit=Product.SaleUnit.UNIT,
            price=Decimal("1200.00"),
        )
        self.lot = InventoryLot.objects.create(
            organization=self.organization,
            product=self.product,
            received_at="2026-08-03",
            best_before="2026-08-08",
            quantity_received=Decimal("10.000"),
            quantity_available=Decimal("10.000"),
            unit_cost=Decimal("900.00"),
        )
        self.unit_lot = InventoryLot.objects.create(
            organization=self.organization,
            product=self.unit_product,
            received_at="2026-08-03",
            quantity_received=Decimal("8.000"),
            quantity_available=Decimal("8.000"),
            unit_cost=Decimal("600.00"),
        )
        self.operator_token = Token.objects.create(user=self.operator)
        self.manager_token = Token.objects.create(user=self.manager)
        self.authenticate(self.operator_token)

    @property
    def organization_header(self):
        return {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}

    def authenticate(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    def movement(self, *, lot=None, movement_type="consumption", quantity="1.500", quantity_available=None, key="movement-key-001", version=1, reason="Venta preparada"):
        payload = {
            "lot": str((lot or self.lot).id),
            "movement_type": movement_type,
            "reason": reason,
            "reference": "REF-001",
        }
        if quantity_available is not None:
            payload["quantity_available"] = quantity_available
        else:
            payload["quantity"] = quantity
        return self.client.post(
            "/api/v1/inventory-movements/",
            payload,
            format="json",
            HTTP_IF_MATCH=str(version),
            HTTP_IDEMPOTENCY_KEY=key,
            **self.organization_header,
        )

    def test_consumption_is_versioned_idempotent_and_audited(self):
        first = self.movement()
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data["lot"]["quantity_available"], "8.500")
        self.assertEqual(first.data["lot"]["version"], 2)
        self.assertEqual(first.data["movement"]["quantity_delta"], "-1.500")
        self.assertEqual(first.data["movement"]["quantity_before"], "10.000")
        self.assertEqual(first.data["movement"]["quantity_after"], "8.500")
        self.assertEqual(InventoryMovement.objects.count(), 1)
        self.assertEqual(AuditEvent.objects.filter(action="inventorylot.consumed").count(), 1)

        replay = self.movement()
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(replay.headers["X-Idempotent-Replay"], "true")
        self.assertEqual(replay.data["movement"]["id"], first.data["movement"]["id"])
        self.assertEqual(InventoryMovement.objects.count(), 1)
        self.assertEqual(AuditEvent.objects.filter(action="inventorylot.consumed").count(), 1)

        conflict = self.movement(quantity="2.000")
        self.assertEqual(conflict.status_code, 409, conflict.data)
        self.assertIn("datos diferentes", str(conflict.data).lower())

    def test_stale_or_excessive_movements_do_not_change_lot(self):
        stale = self.movement(version=99, key="movement-stale-001")
        self.assertEqual(stale.status_code, 409, stale.data)
        self.assertIn("lote cambió", str(stale.data).lower())

        excessive = self.movement(quantity="11.000", key="movement-excess-001")
        self.assertEqual(excessive.status_code, 400, excessive.data)
        self.assertIn("saldo disponible", str(excessive.data).lower())

        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantity_available, Decimal("10.000"))
        self.assertEqual(self.lot.version, 1)
        self.assertEqual(InventoryMovement.objects.count(), 0)

    def test_waste_and_supplier_return_deplete_without_deleting_history(self):
        waste = self.movement(movement_type="waste", quantity="4.000", key="movement-waste-001", reason="Producto golpeado")
        self.assertEqual(waste.status_code, 201, waste.data)
        returned = self.movement(
            movement_type="supplier_return",
            quantity="6.000",
            key="movement-return-001",
            version=2,
            reason="Proveedor aceptó devolución",
        )
        self.assertEqual(returned.status_code, 201, returned.data)
        self.assertEqual(returned.data["lot"]["quantity_available"], "0.000")
        self.assertEqual(returned.data["lot"]["status"], InventoryLot.Status.DEPLETED)
        self.assertEqual(InventoryMovement.objects.filter(lot=self.lot).count(), 2)
        self.assertEqual(AuditEvent.objects.filter(action="inventorylot.wasted").count(), 1)
        self.assertEqual(AuditEvent.objects.filter(action="inventorylot.returned_to_supplier").count(), 1)

        empty = self.movement(movement_type="waste", quantity="1.000", key="movement-empty-001", version=3)
        self.assertEqual(empty.status_code, 409, empty.data)
        self.assertIn("agotado", str(empty.data).lower())

    def test_adjustment_requires_manager_and_cannot_exceed_received(self):
        denied = self.movement(
            movement_type="adjustment",
            quantity_available="7.250",
            key="movement-adjust-denied",
            reason="Conteo físico",
        )
        self.assertEqual(denied.status_code, 403, denied.data)

        self.authenticate(self.manager_token)
        adjusted = self.movement(
            movement_type="adjustment",
            quantity_available="7.250",
            key="movement-adjust-001",
            reason="Conteo físico",
        )
        self.assertEqual(adjusted.status_code, 201, adjusted.data)
        self.assertEqual(adjusted.data["movement"]["quantity_delta"], "-2.750")
        self.assertEqual(adjusted.data["lot"]["quantity_available"], "7.250")

        above = self.movement(
            movement_type="adjustment",
            quantity_available="10.500",
            key="movement-adjust-above",
            version=2,
            reason="Conteo físico repetido",
        )
        self.assertEqual(above.status_code, 400, above.data)
        self.assertIn("nueva recepción", str(above.data).lower())

    def test_unit_products_require_whole_quantities(self):
        fractional = self.movement(
            lot=self.unit_lot,
            movement_type="waste",
            quantity="1.500",
            key="movement-unit-fraction",
            reason="Merma parcial inválida",
        )
        self.assertEqual(fractional.status_code, 400, fractional.data)
        self.assertIn("número entero", str(fractional.data).lower())
        self.unit_lot.refresh_from_db()
        self.assertEqual(self.unit_lot.quantity_available, Decimal("8.000"))
        self.assertEqual(self.unit_lot.version, 1)

    def test_damaged_lot_cannot_be_consumed_but_can_be_wasted(self):
        self.lot.quality = InventoryLot.Quality.DAMAGED
        self.lot.save(update_fields=["quality", "updated_at"])
        consumed = self.movement(key="movement-damaged-consume")
        self.assertEqual(consumed.status_code, 400, consumed.data)
        self.assertIn("no puede consumirse", str(consumed.data).lower())

        wasted = self.movement(movement_type="waste", key="movement-damaged-waste", reason="Descartar lote dañado")
        self.assertEqual(wasted.status_code, 201, wasted.data)

    def test_movement_history_is_scoped_and_read_only(self):
        created = self.movement()
        self.assertEqual(created.status_code, 201, created.data)
        movement_id = created.data["movement"]["id"]

        listing = self.client.get(
            f"/api/v1/inventory-movements/?lot={self.lot.id}",
            **self.organization_header,
        )
        self.assertEqual(listing.status_code, 200, listing.data)
        records = listing.data.get("results", listing.data)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["id"], movement_id)
        self.assertEqual(records[0]["product_name"], "Tomate")

        patch = self.client.patch(
            f"/api/v1/inventory-movements/{movement_id}/",
            {"reason": "Cambiar historia"},
            format="json",
            **self.organization_header,
        )
        self.assertEqual(patch.status_code, 405, patch.data)
        delete = self.client.delete(
            f"/api/v1/inventory-movements/{movement_id}/",
            **self.organization_header,
        )
        self.assertEqual(delete.status_code, 405, delete.data)