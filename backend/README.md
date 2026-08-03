# Backend MVP · Crohnoz Fresh Market

Backend ejecutable para validar Crohnoz Fresh Market con Camila y Carmelo sin reemplazar silenciosamente la operación local existente.

## Decisión técnica

- Django 5.2 LTS.
- Django REST Framework 3.16.
- PostgreSQL 17 en el Blueprint administrado; SQLite solo para desarrollo y CI rápido.
- Monolito modular pequeño.
- Organización explícita mediante `X-Organization-ID`.
- Roles `owner`, `manager`, `operator` y `viewer`.
- Auditoría servidor append-only con cadena HMAC-SHA256.
- Control optimista opcional mediante `If-Match: <version>`.
- Token temporal del piloto con vencimiento servidor configurable, por defecto 12 horas.
- Pedidos con clave de idempotencia por organización.

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

## Ejecutar con PostgreSQL local

```bash
cd backend
docker compose up --build
```

API local: `http://localhost:8001/api/v1/health/`  
Admin: `http://localhost:8001/admin/`  
Pantalla de conexión: `http://localhost:8000/conexion.html`  
Operación remota: `http://localhost:8000/pedidos-remotos.html`

## Blueprint administrado

El archivo `render.yaml` de la raíz declara recursos aislados para este producto:

- servicio `crohnoz-fresh-market-api`;
- base `crohnoz-fresh-market-db`;
- PostgreSQL sin acceso público directo;
- health check `/api/v1/health/`;
- migraciones antes de cada despliegue;
- carga inicial mediante `seed_pilot` solo en la primera instancia;
- secretos generados para Django y auditoría;
- contraseñas de Camila y Carmelo solicitadas al crear el Blueprint.

Flujo de despliegue:

1. Conectar este repositorio como Blueprint en Render.
2. Revisar que el Blueprint apunte a `main`.
3. Ingresar `CAMILA_PILOT_PASSWORD` y `CARMELO_PILOT_PASSWORD` por el panel seguro.
4. Aplicar el Blueprint.
5. Esperar que build, migraciones, seed y health check terminen correctamente.
6. Copiar la URL HTTPS terminada en `/api/v1`.
7. Probarla desde `/conexion`.
8. Restringir el CSP de Netlify al hostname definitivo de la API.

No se debe ejecutar `seed_pilot` con claves enviadas por correo, chat público, commits o logs.

## Flujo de conexión del frontend

1. Abrir `/conexion.html`.
2. Configurar la base API, por ejemplo `http://localhost:8001/api/v1`.
3. Probar el endpoint de salud.
4. Ingresar con la cuenta individual.
5. Elegir la organización si la cuenta posee más de una membresía.
6. Verificar rol, conteos y catálogo del servidor.
7. Abrir `/pedidos-remotos.html`.
8. Consultar productos activos, crear un pedido ficticio y comprobar que aparezca en el listado remoto.

El frontend guarda únicamente la URL y el modo local/API en `localStorage`. El token, la identidad y la organización activa viven en `sessionStorage`, no entran en respaldos y desaparecen al cerrar sesión, cerrar la pestaña o detectar el vencimiento informado por el servidor.

## Endpoints del puente

- `GET /api/v1/health/`
- `POST /api/v1/auth/login/`
- `POST /api/v1/auth/logout/`
- `GET /api/v1/me/`
- `GET /api/v1/connection-summary/`
- `GET /api/v1/organizations/`
- `GET /api/v1/products/?is_active=true`
- `/api/v1/inventory-lots/`
- `GET` y `POST /api/v1/orders/`
- `GET /api/v1/audit-events/` para `manager` y `owner`

## Idempotencia de pedidos

Cada creación remota incluye `idempotency_key`:

- el primer envío crea el pedido y devuelve `201`;
- un reintento idéntico devuelve el mismo pedido con `200` y `X-Idempotent-Replay: true`;
- reutilizar la clave con datos diferentes devuelve `409`;
- solo se genera un evento `order.created`.

La pantalla remota conserva la clave después de un error de red y la rota únicamente cuando recibe una respuesta exitosa.

## Seguridad del puente

- Los intentos de login están limitados a 8 por minuto por origen.
- Los tokens vencidos son rechazados en todas las peticiones.
- Cada login rota el token anterior; logout lo elimina explícitamente.
- Un token vencido que siga almacenado en la tabla no vuelve a ser válido y se reemplaza en el próximo login.
- El frontend solo acepta HTTPS, salvo `localhost` y `127.0.0.1` para desarrollo.
- La contraseña no se persiste y el formulario se limpia después de cada intento.
- CORS usa la allowlist exacta del frontend productivo en el Blueprint.
- Cada petición operacional vuelve a validar membresía y rol.
- Cambiar de URL API elimina la sesión anterior del navegador.
- La operación remota no cambia silenciosamente al modo local ante un error del servidor.

## Variables relevantes

- `DATABASE_URL`, preferida en hosting administrado.
- `DATABASE_*`, alternativa para despliegues manuales.
- `DJANGO_SECRET_KEY`.
- `DJANGO_ALLOWED_HOSTS` o `RENDER_EXTERNAL_HOSTNAME`.
- `DJANGO_CORS_ALLOWED_ORIGINS`.
- `DJANGO_CSRF_TRUSTED_ORIGINS`.
- `AUDIT_HMAC_KEY`.
- `PILOT_TOKEN_MAX_HOURS`, entre 1 y 24.
- `CAMILA_PILOT_PASSWORD`.
- `CARMELO_PILOT_PASSWORD`.

## Límites de esta versión

- El Blueprint está listo, pero la instancia pública todavía debe crearse y verificarse.
- Catálogo y pedidos ya tienen una superficie API separada; ventas, pagos, fiados, lotes y cierre cotidianos todavía permanecen locales.
- No existe sincronización bidireccional ni cola offline.
- No hay recuperación de contraseña ni envío de correo.
- Debe verificarse la política real de backups del proveedor antes de usar datos operacionales.
- El CSP del frontend permite temporalmente conexiones HTTPS a cualquier host y debe restringirse al hostname definitivo.
- No hay importador ejecutable del paquete Kernel todavía.
- No deben usarse datos personales reales en esta fase.
