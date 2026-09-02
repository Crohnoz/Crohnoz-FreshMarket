# Backend MVP · Crohnoz Fresh Market

Backend ejecutable para validar Crohnoz Fresh Market en la verdulería de Camila sin reemplazar silenciosamente la operación local existente.

## Decisión técnica

- Django 5.2 LTS.
- Django REST Framework 3.16.
- PostgreSQL 17 en el Blueprint administrado; SQLite solo para desarrollo y CI rápido.
- Monolito modular pequeño.
- Organización explícita mediante `X-Organization-ID`.
- Roles `owner`, `manager`, `operator` y `viewer`.
- Auditoría servidor append-only con cadena HMAC-SHA256.
- Libro append-only de movimientos de inventario.
- Control optimista obligatorio mediante `If-Match: <version>` en mutaciones operacionales.
- Token temporal del piloto con vencimiento servidor configurable, por defecto 12 horas.
- Idempotencia en pedidos, recepciones, movimientos y cambios de estado.

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

Las variables del archivo `.env` deben cargarse mediante el mecanismo seguro del entorno. El repositorio no carga `.env` automáticamente y no debe contener secretos reales.

## Preparar el primer piloto con Camila

```bash
export CAMILA_PILOT_PASSWORD='una-clave-unica-de-al-menos-12-caracteres'
python manage.py seed_pilot
```

En PowerShell:

```powershell
$env:CAMILA_PILOT_PASSWORD="una-clave-unica-de-al-menos-12-caracteres"
python manage.py seed_pilot
```

El comando es idempotente y:

- crea o actualiza una organización piloto;
- crea la cuenta genérica `administracion` para Camila;
- asigna a Camila como `owner`, con control administrativo completo;
- carga un catálogo ficticio;
- no genera contraseñas predeterminadas;
- no imprime contraseñas.

## Ejecutar con PostgreSQL local

```bash
cd backend
docker compose up --build
```

API local: `http://localhost:8001/api/v1/health/`  
Admin: `http://localhost:8001/admin/`  
Conexión: `http://localhost:8000/conexion.html`  
Inventario remoto: `http://localhost:8000/inventario-remoto.html`  
Pedidos remotos: `http://localhost:8000/pedidos-remotos.html`

## Blueprint administrado

`render.yaml` declara recursos aislados:

- servicio `crohnoz-fresh-market-api`;
- base `crohnoz-fresh-market-db`;
- PostgreSQL sin acceso público directo;
- health check `/api/v1/health/`;
- migraciones durante el build;
- carga inicial del piloto;
- secretos generados para Django y auditoría;
- contraseñas solicitadas al crear el Blueprint.

Flujo:

1. Conectar el repositorio como Blueprint.
2. Confirmar que apunta a `main`.
3. Ingresar la contraseña temporal de Camila por el panel seguro.
4. Aplicar el Blueprint.
5. Verificar build, migraciones, seed y health check.
6. Copiar la URL HTTPS terminada en `/api/v1`.
7. Probarla desde `/conexion`.
8. Restringir el CSP de Netlify al hostname definitivo.

No ejecutar `seed_pilot` con claves enviadas por correo, chat público, commits o logs.

## Endpoints principales

- `GET /api/v1/health/`
- `POST /api/v1/auth/login/`
- `POST /api/v1/auth/logout/`
- `POST /api/v1/auth/change-password/`
- `GET /api/v1/me/`
- `GET /api/v1/connection-summary/`
- `GET /api/v1/organizations/`
- `GET /api/v1/products/?is_active=true`
- `GET /api/v1/inventory-lots/`
- `POST /api/v1/inventory-lots/receive/`
- `GET /api/v1/inventory-movements/`
- `POST /api/v1/inventory-movements/`
- `GET` y `POST /api/v1/orders/`
- `POST /api/v1/orders/{id}/start-preparing/`
- `POST /api/v1/orders/{id}/confirm-weighing/`
- `POST /api/v1/orders/{id}/mark-ready/`
- `GET /api/v1/audit-events/` para `manager` y `owner`

## Recepción de inventario

`POST /inventory-lots/receive/` requiere `Idempotency-Key`.

El servidor:

- valida producto activo y organización;
- exige cantidad positiva y costo no negativo;
- exige cantidades enteras para unidad y paquete;
- crea el lote con disponibilidad inicial completa;
- registra `inventorylot.received`;
- devuelve replay seguro para la misma solicitud;
- responde conflicto si la clave cambia de contenido.

Los lotes no aceptan creación, reemplazo, edición ni eliminación genérica.

## Movimientos de inventario

`POST /inventory-movements/` exige:

```text
If-Match: <version-del-lote>
Idempotency-Key: <clave-estable>
```

Tipos:

- `consumption`: descuenta consumo; rol `operator`.
- `waste`: descuenta merma; rol `operator`.
- `supplier_return`: descuenta devolución; rol `operator`.
- `adjustment`: fija un nuevo saldo; rol `manager`.

Cada movimiento guarda:

- saldo anterior;
- variación;
- saldo resultante;
- motivo y referencia;
- actor;
- firma de solicitud;
- clave de idempotencia.

Reglas:

- no existe saldo negativo;
- una salida no supera la disponibilidad;
- unidad y paquete requieren enteros;
- un ajuste no supera la recepción original;
- un lote dañado no se consume;
- un lote agotado no admite nuevas salidas;
- versión obsoleta devuelve `409`;
- replay idéntico devuelve `200` y `X-Idempotent-Replay: true`;
- clave cruzada entre lote, tipo o contenido devuelve `409`;
- movimientos no aceptan `PATCH` ni `DELETE`.

## FEFO remoto

Antes de `consumption`, el servidor bloquea organización y lotes dentro de la transacción y determina el primer lote utilizable:

1. activo y con saldo;
2. calidad distinta de `damaged`;
3. fecha preferente más próxima;
4. si no hay fecha, recepción más antigua;
5. desempate por creación e ID.

Consumir un lote posterior devuelve `400` indicando el lote prioritario. Al agotarse el primero, el siguiente queda habilitado. Un replay exitoso no se invalida si después aparece una recepción con fecha anterior.

La versión actual no distribuye automáticamente una cantidad entre varios lotes; se registran movimientos separados.

## Pedidos y preparación

La creación remota incluye `idempotency_key`:

- primer envío: `201`;
- replay idéntico: `200` y `X-Idempotent-Replay: true`;
- misma clave con datos distintos: `409`;
- una sola auditoría `order.created`.

El backend fija todo pedido nuevo como `confirmed`, `pending`, `operator` y rechaza cantidades reales prellenadas.

Las transiciones exigen `If-Match` e `Idempotency-Key`:

- `confirmed → preparing`;
- pesaje completo solo en `preparing`;
- recálculo del total en servidor;
- `preparing → ready` solo con todas las líneas completas;
- versión obsoleta devuelve `409`;
- una clave no cruza pedidos;
- `PUT`, `PATCH` y `DELETE` genéricos están bloqueados.

## Seguridad del puente

- Login limitado a 8 intentos por minuto por origen.
- Tokens vencidos rechazados.
- Cada login rota el token anterior; logout lo elimina.
- Cambiar la contraseña exige la clave actual, valida la nueva, registra auditoría e invalida todas las sesiones.
- Frontend solo acepta HTTPS, salvo `localhost` y `127.0.0.1`.
- La contraseña no se persiste.
- CORS usa una allowlist exacta.
- Cada petición vuelve a validar membresía y rol.
- Cambiar la URL API elimina la sesión anterior.
- No existe fallback silencioso a modo local.
- Mutaciones críticas usan transacciones, idempotencia y versión.

## Variables relevantes

- `DATABASE_URL` o `DATABASE_*`.
- `DJANGO_SECRET_KEY`.
- `DJANGO_ALLOWED_HOSTS` o `RENDER_EXTERNAL_HOSTNAME`.
- `DJANGO_CORS_ALLOWED_ORIGINS`.
- `DJANGO_CSRF_TRUSTED_ORIGINS`.
- `AUDIT_HMAC_KEY`.
- `PILOT_TOKEN_MAX_HOURS`, entre 1 y 24.
- `CAMILA_PILOT_PASSWORD`.

## Límites de esta versión

- El Blueprint está listo, pero la instancia pública debe crearse y verificarse.
- Catálogo, recepción, movimientos, pedidos, preparación y estado listo tienen API separada.
- No hay reparto automático entre lotes, cobro, fiado, entrega ni cierre remotos.
- No existe sincronización bidireccional ni cola offline.
- No hay recuperación de contraseña ni correo.
- Debe verificarse la política real de backups del proveedor.
- El CSP debe restringirse al hostname definitivo.
- No hay importador ejecutable del paquete Kernel.
- No deben usarse datos personales reales en esta fase.
