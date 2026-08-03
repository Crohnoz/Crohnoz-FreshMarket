# Puente frontend–API · Crohnoz Fresh Market

Fecha de corte: 2 de agosto de 2026.  
Versión objetivo: `0.6.0-pilot`.

## Propósito

Conectar progresivamente la interfaz estática actual con el backend Django sin reescribir la experiencia de usuario ni perder el modo local que permite demostraciones y recuperación controlada.

Este bloque no migra todavía todas las operaciones comerciales. Entrega una vía verificable para:

- configurar la API;
- comprobar disponibilidad;
- iniciar sesión con cuentas individuales;
- seleccionar organización;
- visualizar rol, conteos y catálogo del servidor;
- cerrar sesión;
- volver explícitamente al modo local.

## Estados visibles

La franja superior de las superficies operacionales informa uno de cuatro estados:

1. **Modo local:** los datos permanecen solo en el navegador.
2. **API configurada, sin sesión:** existe una URL válida, pero no hay identidad autenticada.
3. **Falta elegir negocio:** la cuenta es válida y posee varias organizaciones.
4. **Backend conectado:** existen identidad, organización y rol activos.

No se muestra una apariencia de sincronización cuando las operaciones siguen usando `localStorage`.

## Datos persistidos en el navegador

### `localStorage`

Solo se guardan:

- modo `local` o `api`;
- URL base de la API.

Estos valores pueden aparecer en un respaldo local porque no son credenciales.

### `sessionStorage`

Se guardan temporalmente:

- token;
- resumen de usuario;
- membresías;
- organización seleccionada;
- hora de creación;
- vencimiento informado por el servidor.

La sesión no se exporta en respaldos, no se comparte entre pestañas nuevas y se elimina al cerrar sesión o detectar vencimiento.

La contraseña no se persiste en ningún storage.

## Controles del servidor

- autenticación DRF Token temporal;
- vencimiento configurable entre 1 y 24 horas, por defecto 12;
- eliminación de tokens vencidos;
- 8 intentos de login por minuto por origen;
- membresía activa obligatoria;
- organización activa obligatoria;
- header `X-Organization-ID` para el contexto;
- RBAC en cada endpoint;
- auditoría servidor para mutaciones;
- CORS por allowlist;
- HTTPS obligatorio fuera de desarrollo local.

## Flujo de conexión

1. El operador abre `/conexion`.
2. Ingresa la URL `https://<host>/api/v1`.
3. El navegador consulta `GET /health/` sin credenciales.
4. Si la API está disponible, se habilita el ingreso.
5. El operador envía usuario y contraseña a `POST /auth/login/`.
6. El servidor devuelve token de vida finita, usuario y membresías.
7. Con una membresía se selecciona automáticamente la organización.
8. Con varias membresías se exige elección explícita.
9. El frontend consulta `GET /connection-summary/` con token y organización.
10. La franja global muestra usuario, negocio y rol.

## Rollout recomendado

### Fase 1 — Entorno local

- Django en `localhost:8001`;
- frontend en `localhost:8000`;
- SQLite para prueba rápida;
- cuentas ficticias;
- verificar login, vencimiento y logout;
- verificar que el modo local continúa intacto.

### Fase 2 — Staging

- PostgreSQL administrado;
- API bajo HTTPS;
- dominio o subdominio de staging;
- CORS limitado a deploy preview y staging;
- secretos separados;
- ejecutar `seed_pilot` con claves entregadas por canal seguro;
- probar dos sesiones simultáneas.

### Fase 3 — Piloto cerrado

- frontend productivo;
- API productiva;
- CSP restringido al hostname exacto de la API;
- CORS restringido al frontend productivo;
- respaldo inicial de PostgreSQL;
- monitoreo de health check y errores;
- conexión de catálogo y pedidos mediante adaptador.

## Rollback

El rollback de interfaz consiste en:

1. abrir `/conexion`;
2. seleccionar **Seguir en modo local**;
3. confirmar el cierre de sesión;
4. verificar que la franja muestre **Modo local**.

Esto no borra datos del backend ni restaura automáticamente datos locales. Evita cambios silenciosos de fuente de verdad.

El rollback de despliegue debe conservar:

- la base PostgreSQL;
- secretos y claves HMAC;
- migraciones aplicadas;
- logs del incidente;
- backup previo al cambio.

## Estrategia de migración de pantallas

Cada área debe migrarse detrás de una interfaz de repositorio:

```text
Pantalla
  ↓
Repositorio de dominio
  ├── implementación local
  └── implementación API
```

Orden recomendado:

1. lectura de catálogo;
2. creación y lectura de pedidos;
3. lotes e inventario;
4. transiciones de preparación;
5. pagos y fiados;
6. cierre diario;
7. respaldos y recuperación del servidor.

Una pantalla no debe mezclar escrituras locales y remotas dentro de la misma operación.

## Criterios para conectar una operación

- endpoint y serializer probados;
- mensajes de error en lenguaje cotidiano;
- idempotencia cuando corresponda;
- organización y permisos comprobados;
- estado de carga y reintento visible;
- comportamiento offline definido;
- estrategia de rollback;
- pruebas de frontend y backend;
- validación con Camila o Carmelo.

## CSP temporal

Mientras la URL final no exista, Netlify permite `connect-src https:` y HTTP únicamente para localhost. Esta regla facilita staging, pero es más amplia de lo deseable.

Al definir el host, debe reemplazarse por una allowlist explícita, por ejemplo:

```text
connect-src 'self' https://api-freshmarket.crohnoz.cl
```

## Límites actuales

- Django todavía no está desplegado.
- El login y resumen están conectados; las mutaciones operacionales siguen locales.
- No existe sincronización offline.
- No existe cola de reintentos.
- No existe recuperación de contraseña.
- No existe refresh token.
- No existe MFA.
- No se deben ingresar datos personales reales.
