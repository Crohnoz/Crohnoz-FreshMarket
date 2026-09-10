from io import StringIO
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from .models import Membership, Organization, Product


class SeedPilotCommandTests(TestCase):
    def test_seed_requires_explicit_passwords(self):
        with patch.dict(
            "os.environ",
            {"PILOT_MANAGER_PASSWORD": "", "PILOT_OPERATOR_PASSWORD": ""},
            clear=False,
        ):
            with self.assertRaises(CommandError):
                call_command("seed_pilot")
        self.assertFalse(User.objects.exists())

    def test_seed_rejects_passwords_shorter_than_minimum(self):
        with patch.dict(
            "os.environ",
            {"PILOT_MANAGER_PASSWORD": "corta-123", "PILOT_OPERATOR_PASSWORD": "breve-456"},
            clear=False,
        ):
            with self.assertRaisesRegex(CommandError, "al menos 12 caracteres"):
                call_command("seed_pilot")
        self.assertFalse(User.objects.exists())
        self.assertFalse(Organization.objects.exists())

    def test_seed_creates_separate_accounts_without_printing_passwords(self):
        manager_password = "manager-prototype-only-2026"
        operator_password = "operator-prototype-only-2026"
        output = StringIO()
        with patch.dict(
            "os.environ",
            {
                "PILOT_MANAGER_PASSWORD": manager_password,
                "PILOT_OPERATOR_PASSWORD": operator_password,
            },
            clear=False,
        ):
            call_command("seed_pilot", stdout=output)

        organization = Organization.objects.get(slug="mercado-piloto")
        manager = User.objects.get(username="pilot-manager")
        operator = User.objects.get(username="pilot-operator")
        self.assertTrue(manager.check_password(manager_password))
        self.assertTrue(operator.check_password(operator_password))
        self.assertEqual(
            Membership.objects.get(user=manager, organization=organization).role,
            Membership.Role.MANAGER,
        )
        self.assertEqual(
            Membership.objects.get(user=operator, organization=organization).role,
            Membership.Role.OPERATOR,
        )
        self.assertEqual(Product.objects.filter(organization=organization).count(), 4)
        self.assertNotIn(manager_password, output.getvalue())
        self.assertNotIn(operator_password, output.getvalue())

        with patch.dict(
            "os.environ",
            {
                "PILOT_MANAGER_PASSWORD": manager_password,
                "PILOT_OPERATOR_PASSWORD": operator_password,
            },
            clear=False,
        ):
            call_command("seed_pilot", stdout=StringIO())
        self.assertEqual(User.objects.filter(username__in=["pilot-manager", "pilot-operator"]).count(), 2)
        self.assertEqual(Product.objects.filter(organization=organization).count(), 4)
