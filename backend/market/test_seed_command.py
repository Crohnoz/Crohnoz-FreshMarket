from io import StringIO
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from .models import Membership, Organization, Product


class SeedPilotCommandTests(TestCase):
    def test_seed_requires_explicit_passwords(self):
        with patch.dict("os.environ", {"CAMILA_PILOT_PASSWORD": ""}, clear=False):
            with self.assertRaises(CommandError):
                call_command("seed_pilot")
        self.assertFalse(User.objects.exists())

    def test_seed_rejects_passwords_shorter_than_minimum(self):
        with patch.dict(
            "os.environ",
            {"CAMILA_PILOT_PASSWORD": "corta-123"},
            clear=False,
        ):
            with self.assertRaisesRegex(CommandError, "al menos 12 caracteres"):
                call_command("seed_pilot")
        self.assertFalse(User.objects.exists())
        self.assertFalse(Organization.objects.exists())

    def test_seed_creates_camila_owner_account_without_printing_password(self):
        camila_password = "camila-pilot-only-2026"
        output = StringIO()
        with patch.dict(
            "os.environ",
            {
                "CAMILA_PILOT_PASSWORD": camila_password,
            },
            clear=False,
        ):
            call_command("seed_pilot", stdout=output)

        organization = Organization.objects.get(slug="verduleria-piloto-camila")
        camila = User.objects.get(username="administracion")
        self.assertTrue(camila.check_password(camila_password))
        self.assertEqual(
            Membership.objects.get(user=camila, organization=organization).role,
            Membership.Role.OWNER,
        )
        self.assertEqual(Product.objects.filter(organization=organization).count(), 4)
        self.assertNotIn(camila_password, output.getvalue())

        with patch.dict(
            "os.environ",
            {
                "CAMILA_PILOT_PASSWORD": camila_password,
            },
            clear=False,
        ):
            call_command("seed_pilot", stdout=StringIO())
        self.assertEqual(User.objects.filter(username="administracion").count(), 1)
        self.assertEqual(Product.objects.filter(organization=organization).count(), 4)
