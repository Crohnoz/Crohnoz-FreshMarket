from __future__ import annotations

from django.db import transaction
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Membership
from .permissions import access_levels, require_role, resolve_organization_context, role_profile
from .services import record_audit_event


def serialize_membership(membership: Membership) -> dict:
    return {
        "id": str(membership.id),
        "user": {
            "id": membership.user_id,
            "username": membership.user.username,
            "first_name": membership.user.first_name,
            "last_name": membership.user.last_name,
        },
        "role": membership.role,
        "is_active": membership.is_active,
        "access": role_profile(membership.role),
        "version": membership.version,
        "created_at": membership.created_at.isoformat(),
        "updated_at": membership.updated_at.isoformat(),
    }


class TeamView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        context = resolve_organization_context(request)
        require_role(context, Membership.Role.MANAGER)
        memberships = list(
            Membership.objects.select_related("user")
            .filter(organization=context.organization)
            .order_by("-is_active", "role", "user__first_name", "user__username")
        )
        active_count = sum(1 for membership in memberships if membership.is_active)
        return Response({
            "organization": {
                "id": str(context.organization.id),
                "name": context.organization.name,
                "slug": context.organization.slug,
            },
            "business_mode": "solo" if active_count <= 1 else "team",
            "active_members": active_count,
            "current_access": role_profile(context.membership.role),
            "access_levels": access_levels(),
            "members": [serialize_membership(membership) for membership in memberships],
        })


class TeamMemberView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, membership_id):
        context = resolve_organization_context(request)
        require_role(context, Membership.Role.OWNER)

        with transaction.atomic():
            try:
                membership = (
                    Membership.objects.select_for_update()
                    .select_related("user")
                    .get(id=membership_id, organization=context.organization)
                )
            except (Membership.DoesNotExist, ValueError) as exc:
                raise NotFound("El integrante no pertenece al negocio activo.") from exc

            requested_role = request.data.get("role", membership.role)
            if requested_role not in Membership.Role.values:
                raise ValidationError({"role": "Selecciona un nivel de acceso válido."})

            requested_active = request.data.get("is_active", membership.is_active)
            if not isinstance(requested_active, bool):
                raise ValidationError({"is_active": "El estado debe ser verdadero o falso."})

            removes_active_owner = (
                membership.role == Membership.Role.OWNER
                and membership.is_active
                and (requested_role != Membership.Role.OWNER or not requested_active)
            )
            if removes_active_owner:
                other_owners = Membership.objects.select_for_update().filter(
                    organization=context.organization,
                    role=Membership.Role.OWNER,
                    is_active=True,
                ).exclude(id=membership.id)
                if not other_owners.exists():
                    raise ValidationError({"role": "El negocio debe conservar al menos una cuenta dueña activa."})

            before = {
                "role": membership.role,
                "is_active": membership.is_active,
                "version": membership.version,
            }
            membership.role = requested_role
            membership.is_active = requested_active
            membership.version += 1
            membership.full_clean()
            membership.save(update_fields=["role", "is_active", "version", "updated_at"])

            record_audit_event(
                organization=context.organization,
                actor=request.user,
                action="membership.access_updated",
                entity_type=membership._meta.label_lower,
                entity_id=str(membership.id),
                payload={
                    "before": before,
                    "after": {
                        "role": membership.role,
                        "is_active": membership.is_active,
                        "version": membership.version,
                    },
                    "target_user_id": membership.user_id,
                },
            )

        return Response(serialize_membership(membership))
