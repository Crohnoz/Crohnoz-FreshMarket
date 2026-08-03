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
    help = "Crea o actualiza el negocio piloto y las cuentas separadas de Camila y Carmelo."

    def add_arguments(self, parser):
        parser.add_argument("--organization-name", default="Mercado Piloto Camila y Carmelo")
        parser.add_argument("--organization-slug", default="mercado-piloto-camila-carmelo")
        parser.add_argument("--camila-username", default="camila")
        parser.add_argument("--carmelo-username", default="carmelo")

    @transaction.atomic
    def handle(self, *args, **options):
        camila_password = os.getenv("CAMILA_PILOT_PASSWORD", "")
        carmelo_password = os.getenv("CARMELO_PILOT_PASSWORD", "")
        if not camila_password or not carmelo_password:
            raise CommandError(
                "Define CAMILA_PILOT_PASSWORD y CARMELO_PILOT_PASSWORD antes de ejecutar el comando. "
                "No se generan claves predeterminadas."
            )
        if len(camila_password) < 12 or len(carmelo_password) < 12:
            raise CommandError("Las contraseñas del piloto deben tener al menos 12 caracteres.")

        organization, _ = Organization.objects.update_or_create(
            slug=options["organization_slug"],
            defaults={"name": options["organization_name"], "status": Organization.Status.ACTIVE},
        )
        camila = self._upsert_user(options["camila_username"], "Camila", camila_password)
        carmelo = self._upsert_user(options["carmelo_username"], "Carmelo", carmelo_password)
        Membership.objects.update_or_create(
            user=camila,
            organization=organization,
            defaults={"role": Membership.Role.MANAGER, "is_active": True},
        )
        Membership.objects.update_or_create(
            user=carmelo,
            organization=organization,
            defaults={"role": Membership.Role.OPERATOR, "is_active": True},
        )
        for product in PILOT_PRODUCTS:
            Product.objects.update_or_create(
                organization=organization,
                sku=product["sku"],
                defaults={**product, "is_active": True},
            )

        self.stdout.write(self.style.SUCCESS(
            f"Piloto preparado: {organization.name} · Camila manager · Carmelo operator · "
            f"{len(PILOT_PRODUCTS)} productos. No se imprimieron contraseñas."
        ))

    @staticmethod
    def _upsert_user(username: str, first_name: str, password: str) -> User:
        user, _ = User.objects.get_or_create(username=username, defaults={"first_name": first_name})
        user.first_name = first_name
        user.is_active = True
        user.set_password(password)
        user.save(update_fields=["first_name", "is_active", "password"])
        return user
