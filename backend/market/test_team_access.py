from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import AuditEvent, Membership, Organization
from .permissions import role_profile


class TeamAccessApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="duena", password="safe-test-password", first_name="Camila")
        self.manager = User.objects.create_user(username="encargada", password="safe-test-password", first_name="Paula")
        self.operator = User.objects.create_user(username="operador", password="safe-test-password", first_name="Diego")
        self.organization = Organization.objects.create(name="Frutería Escala", slug="fruteria-escala")
        self.owner_membership = Membership.objects.create(
            user=self.owner,
            organization=self.organization,
            role=Membership.Role.OWNER,
        )
        self.manager_membership = Membership.objects.create(
            user=self.manager,
            organization=self.organization,
            role=Membership.Role.MANAGER,
        )
        self.operator_membership = Membership.objects.create(
            user=self.operator,
            organization=self.organization,
            role=Membership.Role.OPERATOR,
        )
        self.authenticate(self.owner)

    def authenticate(self, user):
        Token.objects.filter(user=user).delete()
        token = Token.objects.create(user=user)
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Token {token.key}",
            HTTP_X_ORGANIZATION_ID=str(self.organization.id),
        )

    def test_role_profiles_map_to_three_operational_levels(self):
        self.assertEqual(role_profile(Membership.Role.OPERATOR)["level"], 1)
        self.assertEqual(role_profile(Membership.Role.MANAGER)["level"], 2)
        owner_profile = role_profile(Membership.Role.OWNER)
        self.assertEqual(owner_profile["level"], 3)
        self.assertIn("manage_access", owner_profile["capabilities"])

    def test_manager_can_view_team_but_operator_cannot(self):
        self.authenticate(self.manager)
        response = self.client.get(reverse("team"))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["business_mode"], "team")
        self.assertEqual(response.data["active_members"], 3)
        self.assertEqual(len(response.data["access_levels"]), 3)

        self.authenticate(self.operator)
        denied = self.client.get(reverse("team"))
        self.assertEqual(denied.status_code, 403)

    def test_owner_changes_existing_member_access_and_records_audit(self):
        response = self.client.patch(
            reverse("team-member", kwargs={"membership_id": self.operator_membership.id}),
            {"role": Membership.Role.MANAGER, "is_active": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["access"]["level"], 2)
        self.operator_membership.refresh_from_db()
        self.assertEqual(self.operator_membership.role, Membership.Role.MANAGER)
        event = AuditEvent.objects.get(action="membership.access_updated")
        self.assertEqual(event.entity_id, str(self.operator_membership.id))
        self.assertEqual(event.payload["after"]["role"], Membership.Role.MANAGER)

    def test_manager_cannot_change_access(self):
        self.authenticate(self.manager)
        response = self.client.patch(
            reverse("team-member", kwargs={"membership_id": self.operator_membership.id}),
            {"role": Membership.Role.VIEWER, "is_active": True},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_last_active_owner_cannot_be_demoted_or_disabled(self):
        demote = self.client.patch(
            reverse("team-member", kwargs={"membership_id": self.owner_membership.id}),
            {"role": Membership.Role.MANAGER, "is_active": True},
            format="json",
        )
        self.assertEqual(demote.status_code, 400)
        self.assertIn("al menos una cuenta dueña", str(demote.data).lower())

        disable = self.client.patch(
            reverse("team-member", kwargs={"membership_id": self.owner_membership.id}),
            {"role": Membership.Role.OWNER, "is_active": False},
            format="json",
        )
        self.assertEqual(disable.status_code, 400)
        self.owner_membership.refresh_from_db()
        self.assertTrue(self.owner_membership.is_active)
        self.assertEqual(self.owner_membership.role, Membership.Role.OWNER)
