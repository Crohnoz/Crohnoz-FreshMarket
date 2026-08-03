# Puente frontend–API · Crohnoz Fresh Market

Fecha de corte: 2 de agosto de 2026.  
Versión objetivo: `0.7.0-pilot`.

## Propósito

Conectar progresivamente la interfaz estática actual con el backend Django sin reescribir la experiencia de usuario ni perder el modo local que permite demostraciones y recuperación controlada.

Esta versión entrega una vía verificable para:

- configurar la API;
- comprobar disponibilidad;
- iniciar sesión con cuentas individuales;
- seleccionar organización;
- visualizar rol, conteos y catálogo del servidor;
- leer catálogo activo en una operación remota separada;
- crear y listar pedidos remotos idempotentes;
- cerrar sesión;
- volver explícitamente al modo local.

## Estados visibles

La franja superior de las superficies operacionales informa uno de cuatro estados:

1. **Modo local:** los datos permanecen solo en el navegador.
2. **API configurada, sin sesión:** existe una URL válida, pero no hay identidad autenticada.
3. **Falta elegir negocio:** la cuenta es válida y posee varias organizaciones.
4. **Backend conectado:** existen identidad, organización y rol activos.

La franja expresa el estado de la sesión, no afirma que todas las pantallas estén sincronizadas.

## Fuentes de verdad

| Superficie | Fuente de verdad |
| --- | --- |
| `/conexion` | Django para sesión y resumen; navegador para URL y modo |
| `/pedidos-remotos` | Django/PostgreSQL |
| `/ventas`, `/inventario`, `/compras`, `/cuentas`, `/cierre`, `/admin` | `localStorage` |

No se mezclan escrituras locales y remotas dentro de una misma operación.

## Datos persistidos en el navegador

### `localStorage`

Se guardan:

- modo `local` o `api`;
- URL base de la API;
- datos de las superficies locales existentes.

Los valores de configuración pueden aparecer en un respaldo local porque no son credenciales. Los pedidos remotos no se copian automáticamente a `localStorage`.

### `sessionStorage`

Se guardan temporalmente:

- token;
- resumen de usuario;
- membresías;
- organización seleccionada;
- hora de creación;
- vencimiento informado por el servidor.

La sesión no se exporta en respaldos, no se comparte entre pestañas nuevas y se elimina del navegador al cerrar sesión, cerrar la pestaña o detectar su vencimiento.

La contraseña no se persiste en ningún storage.

## Controles del servidor

- autenticación DRF Token temporal;
- vencimiento configurable entre 1 y 24 horas, por defecto 12;
- rechazo permanente de tokens vencidos;
- rotación del token anterior en cada login válido;
- eliminación explícita al cerrar sesión;
- 8 intentos de login por minuto por origen;
- membresía activa obligatoria;
- organización activa obligatoria;
- header `X-Organization-ID` para el contexto;
- RBAC en cada endpoint;
- idempotencia de pedidos por organización;
- auditoría servidor para mutaciones;
- CORS por allowlist;
- HTTPS obligatorio fuera de desarrollo local.

Un token vencido puede permanecer físicamente en la tabla hasta el siguiente login de esa cuenta, pero la autenticación lo rechaza en todas las peticiones. El login siguiente elimina el token anterior y crea uno nuevo.

## Flujo de conexión

1. El operador abre `/conexion`.
2. Ingresa la URL `https://<host>/api/v1`.
3. El navegador consulta `GET /health/` sin credenciales.
4. Si la API está disponible, se habilita el ingreso.
5. El operador envía usuario y contraseña a `POST /auth/login/`.
6. El servidor rota cualquier token anterior y devuelve uno de vida finita, usuario y membresías.
7. Con una membresía se selecciona automáticamente la organización.
8. Con varias membresías se exige elección explícita.
9. El frontend consulta `GET /connection-summary/` con token y organización.
10. La franja global muestra usuario, negocio y rol.
11. El operador abre `/pedidos-remotos` para usar catálogo y pedidos del servidor.

## Operación remota actual

La ruta `/pedidos-remotos`:

- bloquea el acceso operacional sin sesión conectada;
- consulta `GET /products/?is_active=true`;
- pagina como máximo 20 páginas;
- consulta `GET /orders/`;
- crea pedidos mediante `POST /orders/`;
- conserva la clave de idempotencia si ocurre un error;
- rota la clave solo después de una respuesta exitosa;
- no activa un fallback local.

Un reintento idéntico devuelve el pedido existente. Reutilizar la clave con datos diferentes devuelve conflicto y no altera el pedido original.

## Rollout recomendado

### Fase 1 — Entorno local

- Django en `localhost:8001`;
- frontend en `localhost:8000`;
- SQLite para prueba rápida;
- cuentas ficticias;
- verificar login, vencimiento y logout;
- crear y reintentar un pedido remoto;
- verificar que el modo local continúa intacto.

### Fase 2 — Hosting administrado

- crear servicio y PostgreSQL desde `render.yaml`;
- API bajo HTTPS;
- CORS limitado al frontend productivo;
- secretos separados;
- ejecutar migraciones y `seed_pilot`;
- comprobar health check;
- probar idempotencia bajo red real;
- probar dos sesiones simultáneas.

### Fase 3 — Piloto cerrado

- frontend productivo;
- API productiva verificada;
- CSP restringido al hostname exacto de la API;
- respaldo inicial de PostgreSQL confirmado;
- monitoreo de health check y errores;
- catálogo y pedidos remotos aprobados por los operadores.

## Rollback

El rollback de interfaz consiste en:

1. abrir `/conexion`;
2. seleccionar **Seguir en modo local**;
3. confirmar el cierre de sesión;
4. verificar que la franja muestre **Modo local**;
5. continuar por las pantallas locales.

Esto no borra datos del backend ni restaura automáticamente datos locales. Tampoco importa pedidos remotos al navegador.

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

Estado del orden recomendado:

1. lectura de catálogo — implementada en superficie remota;
2. creación y lectura de pedidos — implementada en superficie remota;
3. transiciones de preparación y pesaje — pendiente;
4. lotes e inventario — pendiente;
5. pagos y fiados — pendiente;
6. cierre diario — pendiente;
7. respaldos y recuperación del servidor — pendiente.

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

Mientras la URL final no exista, Netlify permite `connect-src https:` y HTTP únicamente en `localhost:8001` o `127.0.0.1:8001`. Esta regla facilita el primer despliegue, pero es más amplia de lo deseable para destinos HTTPS.

Al definir el host, debe reemplazarse por una allowlist explícita, por ejemplo:

```text
connect-src 'self' https://crohnoz-fresh-market-api.onrender.com
```

## Límites actuales

- El Blueprint está preparado, pero la instancia pública todavía no está creada ni verificada.
- Solo catálogo y pedidos tienen una superficie operacional remota.
- Pesaje, estados, inventario, pagos, fiados y cierre siguen locales.
- No existe sincronización offline ni cola de reintentos.
- El shell remoto puede abrirse offline, pero no consulta ni escribe sin red.
- No existe recuperación de contraseña.
- No existe refresh token.
- No existe MFA.
- No se deben ingresar datos personales reales.
