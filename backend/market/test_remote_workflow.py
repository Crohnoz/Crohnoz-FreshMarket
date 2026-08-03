from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import AuditEvent, InventoryLot, Membership, Order, Organization, Product


class RemoteWorkflowTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="operador", password="safe-test-password")
        self.organization = Organization.objects.create(name="Mercado Flujo", slug="mercado-flujo")
        Membership.objects.create(
            user=self.user,
            organization=self.organization,
            role=Membership.Role.OPERATOR,
        )
        self.product = Product.objects.create(
            organization=self.organization,
            sku="PAL-001",
            name="Palta",
            category="Frutas",
            sale_unit=Product.SaleUnit.KILOGRAM,
            price=Decimal("4500.00"),
        )
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    @property
    def organization_header(self):
        return {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}

    def create_order(self, *, public_id="FM-WORKFLOW-001"):
        response = self.client.post(
            "/api/v1/orders/",
            {
                "public_id": public_id,
                "customer_name": "Cliente piloto",
                "status": "delivered",
                "payment_method": "cash",
                "source": "import",
                "notes": "Retiro",
                "idempotency_key": f"create-{public_id}",
                "items": [{
                    "product": str(self.product.id),
                    "requested_quantity": "1.250",
                    "unit_price": "4500.00",
                }],
            },
            format="json",
            **self.organization_header,
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["status"], Order.Status.CONFIRMED)
        self.assertEqual(response.data["payment_method"], Order.PaymentMethod.PENDING)
        self.assertEqual(response.data["source"], Order.Source.OPERATOR)
        return response

    def test_inventory_reception_is_idempotent_and_direct_mutations_are_blocked(self):
        payload = {
            "product": str(self.product.id),
            "received_at": "2026-08-02",
            "best_before": "2026-08-08",
            "quantity_received": "12.500",
            "unit_cost": "2100.00",
            "quality": "good",
            "notes": "Recepción matinal",
        }
        headers = {
            **self.organization_header,
            "HTTP_IDEMPOTENCY_KEY": "receive-palta-001",
        }
        first = self.client.post("/api/v1/inventory-lots/receive/", payload, format="json", **headers)
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data["quantity_received"], "12.500")
        self.assertEqual(first.data["quantity_available"], "12.500")
        self.assertEqual(InventoryLot.objects.count(), 1)
        self.assertEqual(AuditEvent.objects.filter(action="inventorylot.received").count(), 1)

        replay = self.client.post("/api/v1/inventory-lots/receive/", payload, format="json", **headers)
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(replay.headers["X-Idempotent-Replay"], "true")
        self.assertEqual(replay.data["id"], first.data["id"])
        self.assertEqual(InventoryLot.objects.count(), 1)

        changed = {**payload, "quantity_received": "13.000"}
        conflict = self.client.post("/api/v1/inventory-lots/receive/", changed, format="json", **headers)
        self.assertEqual(conflict.status_code, 409, conflict.data)
        self.assertIn("datos diferentes", str(conflict.data).lower())

        direct = self.client.post(
            "/api/v1/inventory-lots/",
            {**payload, "quantity_available": "12.500", "status": "active"},
            format="json",
            **self.organization_header,
        )
        self.assertEqual(direct.status_code, 405, direct.data)

        patch = self.client.patch(
            f"/api/v1/inventory-lots/{first.data['id']}/",
            {"quantity_available": "1.000"},
            format="json",
            **self.organization_header,
        )
        self.assertEqual(patch.status_code, 405, patch.data)

    def test_reception_rejects_foreign_or_invalid_data(self):
        foreign_org = Organization.objects.create(name="Otro", slug="otro-flujo")
        foreign_product = Product.objects.create(
            organization=foreign_org,
            sku="OTHER",
            name="Ajeno",
            sale_unit=Product.SaleUnit.UNIT,
            price=Decimal("1000.00"),
        )
        base = {
            "received_at": "2026-08-10",
            "best_before": "2026-08-09",
            "quantity_received": "0",
            "unit_cost": "-1",
            "quality": "good",
        }
        response = self.client.post(
            "/api/v1/inventory-lots/receive/",
            {**base, "product": str(foreign_product.id)},
            format="json",
            HTTP_IDEMPOTENCY_KEY="receive-invalid-001",
            **self.organization_header,
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("negocio activo", str(response.data).lower())

    def test_order_uses_explicit_versioned_transitions_and_idempotent_retries(self):
        created = self.create_order()
        order_id = created.data["id"]
        item_id = created.data["items"][0]["id"]

        started = self.client.post(
            f"/api/v1/orders/{order_id}/start-preparing/",
            {},
            format="json",
            HTTP_IF_MATCH="1",
            HTTP_IDEMPOTENCY_KEY="start-preparing-001",
            **self.organization_header,
        )
        self.assertEqual(started.status_code, 200, started.data)
        self.assertEqual(started.data["status"], Order.Status.PREPARING)
        self.assertEqual(started.data["version"], 2)

        replay = self.client.post(
            f"/api/v1/orders/{order_id}/start-preparing/",
            {},
            format="json",
            HTTP_IF_MATCH="1",
            HTTP_IDEMPOTENCY_KEY="start-preparing-001",
            **self.organization_header,
        )
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(replay.headers["X-Idempotent-Replay"], "true")
        self.assertEqual(AuditEvent.objects.filter(action="order.preparing_started").count(), 1)

        stale = self.client.post(
            f"/api/v1/orders/{order_id}/confirm-weighing/",
            {"items": [{"id": item_id, "actual_quantity": "1.300"}]},
            format="json",
            HTTP_IF_MATCH="1",
            HTTP_IDEMPOTENCY_KEY="weigh-stale-001",
            **self.organization_header,
        )
        self.assertEqual(stale.status_code, 409, stale.data)
        self.assertIn("actualiza", str(stale.data).lower())

        weighed = self.client.post(
            f"/api/v1/orders/{order_id}/confirm-weighing/",
            {"items": [{"id": item_id, "actual_quantity": "1.300"}]},
            format="json",
            HTTP_IF_MATCH="2",
            HTTP_IDEMPOTENCY_KEY="weigh-order-001",
            **self.organization_header,
        )
        self.assertEqual(weighed.status_code, 200, weighed.data)
        self.assertEqual(weighed.data["items"][0]["actual_quantity"], "1.300")
        self.assertEqual(weighed.data["total"], "5850.00")
        self.assertEqual(weighed.data["version"], 3)

        weighing_replay = self.client.post(
            f"/api/v1/orders/{order_id}/confirm-weighing/",
            {"items": [{"id": item_id, "actual_quantity": "1.300"}]},
            format="json",
            HTTP_IF_MATCH="2",
            HTTP_IDEMPOTENCY_KEY="weigh-order-001",
            **self.organization_header,
        )
        self.assertEqual(weighing_replay.status_code, 200, weighing_replay.data)
        self.assertEqual(weighing_replay.headers["X-Idempotent-Replay"], "true")
        self.assertEqual(AuditEvent.objects.filter(action="order.weighing_confirmed").count(), 1)

        ready = self.client.post(
            f"/api/v1/orders/{order_id}/mark-ready/",
            {},
            format="json",
            HTTP_IF_MATCH="3",
            HTTP_IDEMPOTENCY_KEY="mark-ready-001",
            **self.organization_header,
        )
        self.assertEqual(ready.status_code, 200, ready.data)
        self.assertEqual(ready.data["status"], Order.Status.READY)
        self.assertEqual(ready.data["version"], 4)

        patch = self.client.patch(
            f"/api/v1/orders/{order_id}/",
            {"status": "delivered"},
            format="json",
            **self.organization_header,
        )
        self.assertEqual(patch.status_code, 405, patch.data)

    def test_order_cannot_be_ready_before_every_line_is_weighed(self):
        created = self.create_order(public_id="FM-WORKFLOW-002")
        order_id = created.data["id"]
        started = self.client.post(
            f"/api/v1/orders/{order_id}/start-preparing/",
            {},
            format="json",
            HTTP_IF_MATCH="1",
            HTTP_IDEMPOTENCY_KEY="start-preparing-002",
            **self.organization_header,
        )
        self.assertEqual(started.status_code, 200, started.data)
        ready = self.client.post(
            f"/api/v1/orders/{order_id}/mark-ready/",
            {},
            format="json",
            HTTP_IF_MATCH="2",
            HTTP_IDEMPOTENCY_KEY="mark-ready-002",
            **self.organization_header,
        )
        self.assertEqual(ready.status_code, 400, ready.data)
        self.assertIn("todas las líneas", str(ready.data).lower())
