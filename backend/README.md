# Backend MVP · Crohnoz Fresh Market

Primer backend ejecutable para validar el producto con Camila y Carmelo sin reemplazar la interfaz actual.

## Decisión técnica

- Django 5.2 LTS.
- Django REST Framework 3.16.
- PostgreSQL 16 en despliegue; SQLite solo para desarrollo y CI rápido.
- Autenticación por token DRF durante el MVP cerrado.
- Organización explícita por `X-Organization-ID`; si el usuario tiene una sola membresía, se selecciona automáticamente.
- Roles: owner, manager, operator y viewer.
- Auditoría servidor append-only con cadena HMAC-SHA256.
- Control optimista opcional mediante `If-Match: <version>`.

La autenticación por token es deliberadamente transitoria. Antes de una apertura comercial debe migrarse a JWT rotatorio u OIDC, agregar recuperación de cuenta y política de sesiones.

## Ejecutar con SQLite

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
set DJANGO_DEBUG=true      # PowerShell: $env:DJANGO_DEBUG="true"
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 8001
```

## Ejecutar con PostgreSQL

```bash
cd backend
docker compose up --build
```

API: `http://localhost:8001/api/v1/health/`
Admin: `http://localhost:8001/admin/`

## Flujo inicial de Camila y Carmelo

1. Crear una organización desde Django Admin.
2. Crear ambos usuarios.
3. Asignar membresías y roles.
4. Crear tokens desde Django Admin.
5. Probar catálogo, inventario y pedidos con datos ficticios.
6. No ingresar datos personales reales hasta desplegar HTTPS, backups cifrados y política de privacidad.

## Endpoints iniciales

- `GET /api/v1/health/`
- `GET /api/v1/me/`
- `GET /api/v1/organizations/`
- `/api/v1/products/`
- `/api/v1/inventory-lots/`
- `/api/v1/orders/`
- `GET /api/v1/audit-events/` para manager/owner

## Límites de este bloque

- La interfaz Netlify aún no consume la API.
- No hay sincronización de `localStorage`.
- No hay recuperación de contraseña ni envío de correo.
- No hay backups automáticos.
- No hay despliegue del backend.
- No hay importador del paquete Kernel todavía.
