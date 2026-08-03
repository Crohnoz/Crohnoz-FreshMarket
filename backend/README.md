# Backend MVP · Crohnoz Fresh Market

Backend ejecutable para validar Crohnoz Fresh Market con Camila y Carmelo sin reemplazar la interfaz operacional existente.

## Decisión técnica

- Django 5.2 LTS.
- Django REST Framework 3.16.
- PostgreSQL 16 en despliegue; SQLite solo para desarrollo y CI rápido.
- Monolito modular pequeño.
- Organización explícita mediante `X-Organization-ID`.
- Roles `owner`, `manager`, `operator` y `viewer`.
- Auditoría servidor append-only con cadena HMAC-SHA256.
- Control optimista opcional mediante `If-Match: <version>`.
- Token temporal del piloto con vencimiento servidor configurable, por defecto 12 horas.

La autenticación por token sigue siendo transitoria. Antes de una apertura comercial debe migrarse a JWT rotatorio u OIDC, agregar recuperación de cuenta, MFA opcional y una política de sesiones formal.

## Ejecutar con SQLite

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver 8001
```

Las variables del archivo `.env` deben cargarse en el shell o mediante el mecanismo seguro del entorno de ejecución. El repositorio no carga `.env` automáticamente y no debe contener secretos reales.

## Preparar el piloto de Camila y Carmelo

El comando es idempotente: puede ejecutarse nuevamente para actualizar el negocio, los roles y el catálogo inicial.

```bash
export CAMILA_PILOT_PASSWORD='una-clave-unica-de-al-menos-12-caracteres'
export CARMELO_PILOT_PASSWORD='otra-clave-unica-de-al-menos-12-caracteres'
python manage.py seed_pilot
```

En PowerShell:

```powershell
$env:CAMILA_PILOT_PASSWORD="una-clave-unica-de-al-menos-12-caracteres"
$env:CARMELO_PILOT_PASSWORD="otra-clave-unica-de-al-menos-12-caracteres"
python manage.py seed_pilot
```

El comando:

- crea o actualiza una organización piloto;
- asigna a Camila como `manager`;
- asigna a Carmelo como `operator`;
- carga tomate, palta, lechuga y banana como catálogo ficticio;
- no genera contraseñas predeterminadas;
- no imprime las contraseñas en consola.

## Ejecutar con PostgreSQL

```bash
cd backend
docker compose up --build
```

API local: `http://localhost:8001/api/v1/health/`  
Admin: `http://localhost:8001/admin/`  
Pantalla frontend: `http://localhost:8000/conexion.html`

## Flujo de conexión del frontend

1. Abrir `/conexion.html`.
2. Configurar la base API, por ejemplo `http://localhost:8001/api/v1`.
3. Probar el endpoint de salud.
4. Ingresar con la cuenta individual.
5. Elegir la organización si la cuenta posee más de una membresía.
6. Verificar rol, conteos y catálogo del servidor.
7. Volver a las pantallas operacionales.

El frontend guarda únicamente la URL y el modo local/API en `localStorage`. El token, la identidad y la organización activa viven en `sessionStorage`, no entran en respaldos y se eliminan al cerrar sesión o vencer la sesión.

## Endpoints del puente

- `GET /api/v1/health/`
- `POST /api/v1/auth/login/`
- `POST /api/v1/auth/logout/`
- `GET /api/v1/me/`
- `GET /api/v1/connection-summary/`
- `GET /api/v1/organizations/`
- `/api/v1/products/`
- `/api/v1/inventory-lots/`
- `/api/v1/orders/`
- `GET /api/v1/audit-events/` para `manager` y `owner`

## Seguridad del puente

- Los intentos de login están limitados a 8 por minuto por origen.
- Los tokens vencen en el servidor y se eliminan cuando se detecta el vencimiento.
- El frontend solo acepta HTTPS, salvo `localhost` y `127.0.0.1` para desarrollo.
- La contraseña no se persiste y el formulario se limpia después de cada intento.
- CORS debe usar una allowlist exacta del frontend desplegado.
- Cada petición operacional vuelve a validar membresía y rol.
- Cambiar de URL API elimina la sesión anterior del navegador.
- El modo local es un rollback explícito; no se activa silenciosamente ante un error del servidor.

## Variables relevantes

- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_CORS_ALLOWED_ORIGINS`
- `DJANGO_CSRF_TRUSTED_ORIGINS`
- `DATABASE_*`
- `AUDIT_HMAC_KEY`
- `PILOT_TOKEN_MAX_HOURS`, entre 1 y 24
- `CAMILA_PILOT_PASSWORD`
- `CARMELO_PILOT_PASSWORD`

## Límites de esta versión

- El backend todavía no está desplegado en Internet.
- La pantalla de conexión ya consume salud, login, logout y resumen, pero ventas, lotes y pedidos cotidianos aún se escriben en modo local.
- No existe sincronización bidireccional ni resolución automática de conflictos.
- No hay recuperación de contraseña ni envío de correo.
- No hay backups automáticos de PostgreSQL configurados.
- El CSP del frontend permite temporalmente conexiones HTTPS a cualquier host; debe restringirse al hostname definitivo de la API al desplegarla.
- No hay importador ejecutable del paquete Kernel todavía.
- No deben usarse datos personales reales en esta fase.
