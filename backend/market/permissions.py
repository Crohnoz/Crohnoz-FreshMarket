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

ROLE_LEVEL = {
    Membership.Role.VIEWER: 0,
    Membership.Role.OPERATOR: 1,
    Membership.Role.MANAGER: 2,
    Membership.Role.OWNER: 3,
}

ROLE_LABEL = {
    Membership.Role.VIEWER: "Solo lectura",
    Membership.Role.OPERATOR: "Operación diaria",
    Membership.Role.MANAGER: "Encargado del negocio",
    Membership.Role.OWNER: "Dueño y administrador",
}

ROLE_CAPABILITIES = {
    Membership.Role.VIEWER: (
        "view_dashboard",
        "view_catalog",
        "view_reports",
    ),
    Membership.Role.OPERATOR: (
        "view_dashboard",
        "view_catalog",
        "view_reports",
        "create_orders",
        "prepare_orders",
        "receive_inventory",
        "record_inventory_movements",
        "register_payments",
    ),
    Membership.Role.MANAGER: (
        "view_dashboard",
        "view_catalog",
        "view_reports",
        "create_orders",
        "prepare_orders",
        "receive_inventory",
        "record_inventory_movements",
        "register_payments",
        "manage_catalog",
        "manage_prices",
        "adjust_inventory",
        "close_day",
        "view_team",
    ),
    Membership.Role.OWNER: (
        "view_dashboard",
        "view_catalog",
        "view_reports",
        "create_orders",
        "prepare_orders",
        "receive_inventory",
        "record_inventory_movements",
        "register_payments",
        "manage_catalog",
        "manage_prices",
        "adjust_inventory",
        "close_day",
        "view_team",
        "manage_business",
        "manage_team",
        "manage_access",
        "export_data",
        "view_audit",
    ),
}

ACCESS_LEVELS = (
    {
        "level": 1,
        "role": Membership.Role.OPERATOR,
        "name": "Operador",
        "summary": "Ventas, pedidos, recepción y movimientos cotidianos.",
    },
    {
        "level": 2,
        "role": Membership.Role.MANAGER,
        "name": "Encargado",
        "summary": "Control operacional, catálogo, precios, ajustes y cierre.",
    },
    {
        "level": 3,
        "role": Membership.Role.OWNER,
        "name": "Dueño",
        "summary": "Configuración, equipo, permisos, auditoría y continuidad.",
    },
)


@dataclass(frozen=True)
class OrganizationContext:
    organization: Organization
    membership: Membership


def role_profile(role: str) -> dict:
    normalized = role if role in ROLE_RANK else Membership.Role.VIEWER
    return {
        "role": normalized,
        "level": ROLE_LEVEL[normalized],
        "label": ROLE_LABEL[normalized],
        "capabilities": list(ROLE_CAPABILITIES[normalized]),
    }


def access_levels() -> list[dict]:
    return [
        {
            **level,
            "capabilities": list(ROLE_CAPABILITIES[level["role"]]),
        }
        for level in ACCESS_LEVELS
    ]


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
