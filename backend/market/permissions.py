from __future__ import annotations

from dataclasses import dataclass

from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from .models import Membership, Organization

ROLE_RANK = {
    Membership.Role.VIEWER: 10,
    Membership.Role.OPERATOR: 20,
    Membership.Role.MANAGER: 30,
    Membership.Role.OWNER: 40,
}


@dataclass(frozen=True)
class OrganizationContext:
    organization: Organization
    membership: Membership


def resolve_organization_context(request) -> OrganizationContext:
    memberships = Membership.objects.select_related("organization").filter(
        user=request.user,
        is_active=True,
        organization__status=Organization.Status.ACTIVE,
    )
    requested_id = request.headers.get("X-Organization-ID", "").strip()
    if requested_id:
        try:
            membership = memberships.get(organization_id=requested_id)
        except (Membership.DoesNotExist, ValueError) as exc:
            raise NotFound("Organización no disponible para este usuario.") from exc
        return OrganizationContext(membership.organization, membership)

    available = list(memberships[:2])
    if not available:
        raise PermissionDenied("El usuario no tiene una organización activa.")
    if len(available) > 1:
        raise ValidationError({"organization": "Envía X-Organization-ID para seleccionar la organización."})
    membership = available[0]
    return OrganizationContext(membership.organization, membership)


def require_role(context: OrganizationContext, minimum_role: str) -> None:
    if ROLE_RANK[context.membership.role] < ROLE_RANK[minimum_role]:
        raise PermissionDenied("El rol actual no permite esta acción.")
