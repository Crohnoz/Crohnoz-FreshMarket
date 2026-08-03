from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import Membership, Organization


class InventoryMovementFilterTests(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username="movement-filter", password="safe-test-password")
        self.organization = Organization.objects.create(name="Mercado Filtros", slug="mercado-filtros")
        Membership.objects.create(user=user, organization=self.organization, role=Membership.Role.VIEWER)
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    @property
    def organization_header(self):
        return {"HTTP_X_ORGANIZATION_ID": str(self.organization.id)}

    def test_invalid_uuid_and_type_filters_return_operator_friendly_400(self):
        invalid_lot = self.client.get(
            "/api/v1/inventory-movements/?lot=not-a-uuid",
            **self.organization_header,
        )
        self.assertEqual(invalid_lot.status_code, 400, invalid_lot.data)
        self.assertIn("no es válido", str(invalid_lot.data).lower())

        invalid_product = self.client.get(
            "/api/v1/inventory-movements/?product=also-not-a-uuid",
            **self.organization_header,
        )
        self.assertEqual(invalid_product.status_code, 400, invalid_product.data)

        invalid_type = self.client.get(
            "/api/v1/inventory-movements/?movement_type=delete-everything",
            **self.organization_header,
        )
        self.assertEqual(invalid_type.status_code, 400, invalid_type.data)
        self.assertIn("tipo de movimiento", str(invalid_type.data).lower())