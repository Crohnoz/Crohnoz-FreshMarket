from __future__ import annotations

import os
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from market.models import Membership, Organization, Product


PILOT_PRODUCTS = [
    {"sku": "TOM-001", "name": "Tomate", "category": "Verduras", "sale_unit": Product.SaleUnit.KILOGRAM, "price": Decimal("1990.00")},
    {"sku": "PAL-001", "name": "Palta", "category": "Frutas", "sale_unit": Product.SaleUnit.KILOGRAM, "price": Decimal("4500.00")},
    {"sku": "LEC-001", "name": "Lechuga", "category": "Verduras", "sale_unit": Product.SaleUnit.UNIT, "price": Decimal("1200.00")},
    {"sku": "BAN-001", "name": "Banana", "category": "Frutas", "sale_unit": Product.SaleUnit.KILOGRAM, "price": Decimal("1600.00")},
]


class Command(BaseCommand):
    help = "Crea o actualiza una organización de prueba y cuentas separadas por rol."

    def add_arguments(self, parser):
        parser.add_argument("--organization-name", default="Mercado Piloto")
        parser.add_argument("--organization-slug", default="mercado-piloto")
        parser.add_argument("--manager-username", default="pilot-manager")
        parser.add_argument("--operator-username", default="pilot-operator")

    @transaction.atomic
    def handle(self, *args, **options):
        manager_password = os.getenv("PILOT_MANAGER_PASSWORD", "")
        operator_password = os.getenv("PILOT_OPERATOR_PASSWORD", "")
        if not manager_password or not operator_password:
            raise CommandError(
                "Define PILOT_MANAGER_PASSWORD y PILOT_OPERATOR_PASSWORD antes de ejecutar el comando. "
                "No se generan claves predeterminadas."
            )
        if len(manager_password) < 12 or len(operator_password) < 12:
            raise CommandError("Las contraseñas del entorno de prueba deben tener al menos 12 caracteres.")

        organization, _ = Organization.objects.update_or_create(
            slug=options["organization_slug"],
            defaults={"name": options["organization_name"], "status": Organization.Status.ACTIVE},
        )
        manager = self._upsert_user(options["manager_username"], "Manager", manager_password)
        operator = self._upsert_user(options["operator_username"], "Operator", operator_password)
        Membership.objects.update_or_create(
            user=manager,
            organization=organization,
            defaults={"role": Membership.Role.MANAGER, "is_active": True},
        )
        Membership.objects.update_or_create(
            user=operator,
            organization=organization,
            defaults={"role": Membership.Role.OPERATOR, "is_active": True},
        )
        for product in PILOT_PRODUCTS:
            Product.objects.update_or_create(
                organization=organization,
                sku=product["sku"],
                defaults={**product, "is_active": True},
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Entorno de prueba preparado: {organization.name} · manager · operator · "
                f"{len(PILOT_PRODUCTS)} productos. No se imprimieron contraseñas."
            )
        )

    @staticmethod
    def _upsert_user(username: str, first_name: str, password: str) -> User:
        user, _ = User.objects.get_or_create(username=username, defaults={"first_name": first_name})
        user.first_name = first_name
        user.is_active = True
        user.set_password(password)
        user.save(update_fields=["first_name", "is_active", "password"])
        return user
