from io import StringIO
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from .models import Membership, Organization, Product


class SeedPilotCommandTests(TestCase):
    def test_seed_requires_explicit_passwords(self):
        with patch.dict("os.environ", {"CAMILA_PILOT_PASSWORD": "", "CARMELO_PILOT_PASSWORD": ""}, clear=False):
            with self.assertRaises(CommandError):
                call_command("seed_pilot")
        self.assertFalse(User.objects.exists())

    def test_seed_rejects_passwords_shorter_than_minimum(self):
        with patch.dict(
            "os.environ",
            {"CAMILA_PILOT_PASSWORD": "corta-123", "CARMELO_PILOT_PASSWORD": "breve-456"},
            clear=False,
        ):
            with self.assertRaisesRegex(CommandError, "al menos 12 caracteres"):
                call_command("seed_pilot")
        self.assertFalse(User.objects.exists())
        self.assertFalse(Organization.objects.exists())

    def test_seed_creates_separate_accounts_without_printing_passwords(self):
        camila_password = "camila-pilot-only-2026"
        carmelo_password = "carmelo-pilot-only-2026"
        output = StringIO()
        with patch.dict(
            "os.environ",
            {
                "CAMILA_PILOT_PASSWORD": camila_password,
                "CARMELO_PILOT_PASSWORD": carmelo_password,
            },
            clear=False,
        ):
            call_command("seed_pilot", stdout=output)

        organization = Organization.objects.get(slug="mercado-piloto-camila-carmelo")
        camila = User.objects.get(username="camila")
        carmelo = User.objects.get(username="carmelo")
        self.assertTrue(camila.check_password(camila_password))
        self.assertTrue(carmelo.check_password(carmelo_password))
        self.assertEqual(
            Membership.objects.get(user=camila, organization=organization).role,
            Membership.Role.MANAGER,
        )
        self.assertEqual(
            Membership.objects.get(user=carmelo, organization=organization).role,
            Membership.Role.OPERATOR,
        )
        self.assertEqual(Product.objects.filter(organization=organization).count(), 4)
        self.assertNotIn(camila_password, output.getvalue())
        self.assertNotIn(carmelo_password, output.getvalue())

        with patch.dict(
            "os.environ",
            {
                "CAMILA_PILOT_PASSWORD": camila_password,
                "CARMELO_PILOT_PASSWORD": carmelo_password,
            },
            clear=False,
        ):
            call_command("seed_pilot", stdout=StringIO())
        self.assertEqual(User.objects.filter(username__in=["camila", "carmelo"]).count(), 2)
        self.assertEqual(Product.objects.filter(organization=organization).count(), 4)
