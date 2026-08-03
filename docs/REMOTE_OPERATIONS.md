# Operación remota · Catálogo y pedidos

Fecha de corte: 2 de agosto de 2026.  
Versión: `0.7.0-pilot`.

## Propósito

Validar el primer flujo comercial persistido en Django sin mezclar escrituras locales y remotas dentro de una misma pantalla.

La superficie `/pedidos-remotos` permite:

- leer productos activos del negocio autenticado;
- crear un pedido con uno o más productos;
- listar pedidos del mismo negocio;
- reintentar una creación sin duplicarla;
- mostrar errores de red, sesión, permisos e integridad sin activar un fallback local.

## Fuente de verdad

| Superficie | Fuente de verdad |
| --- | --- |
| `/pedidos-remotos` | Django/PostgreSQL |
| `/conexion` | Django para sesión y resumen; navegador para URL/configuración |
| `/ventas`, `/inventario`, `/compras`, `/cuentas`, `/cierre` | `localStorage` del navegador |

La aplicación no sincroniza automáticamente ambas fuentes.

## Contrato de sesión

La operación remota exige:

1. modo API activo;
2. URL API válida;
3. token vigente en `sessionStorage`;
4. organización seleccionada;
5. membresía activa con rol suficiente.

Cada petición incluye `Authorization: Token …` y `X-Organization-ID`.

## Contrato de catálogo

Solicitud:

```text
GET /api/v1/products/?is_active=true&page=1
```

El repositorio frontend:

- admite respuesta DRF paginada;
- recorre como máximo 20 páginas;
- convierte decimales a números para presentación;
- rechaza productos sin ID, nombre o precio válido;
- no escribe una copia local del catálogo remoto.

## Contrato de creación de pedido

Solicitud:

```text
POST /api/v1/orders/
```

Campos enviados:

- `public_id` legible para el operador;
- `customer_name`;
- `status=confirmed`;
- `payment_method=pending`;
- `source=operator`;
- `notes` con modalidad y observaciones;
- `idempotency_key` generada por el navegador;
- `items` con producto, cantidad solicitada y precio unitario.

## Idempotencia

La clave se genera antes del primer intento y se conserva mientras no exista una respuesta exitosa.

Resultados:

- primer envío válido: `201 Created`;
- mismo envío y misma clave: `200 OK`, mismo pedido y header `X-Idempotent-Replay: true`;
- clave reutilizada con datos distintos: `409 Conflict`;
- error de red: el navegador conserva la clave para el reintento;
- éxito: el navegador rota la clave.

Esto protege ante doble clic, timeout o respuesta perdida. No reemplaza una cola offline.

## Estados y permisos

La primera versión remota crea pedidos en estado `confirmed`. No permite todavía:

- registrar peso real;
- cambiar estado;
- cobrar;
- cargar fiado;
- descontar inventario;
- cancelar o eliminar;
- resolver conflictos offline.

Estas acciones permanecen fuera de la pantalla para evitar una falsa integración parcial.

## Despliegue preparado

El Blueprint `render.yaml` crea recursos exclusivos para Fresh Market:

- servicio web Python;
- PostgreSQL;
- acceso externo a la base bloqueado;
- secrets independientes;
- migraciones antes del despliegue;
- seed inicial de Camila y Carmelo;
- health check de API.

El Blueprint no debe conectarse a bases de KatYta Studio, IncluMe, Administración Edificio u otros productos.

## Validación requerida después del despliegue

1. `GET /health/` responde `ok`.
2. Camila inicia sesión y obtiene rol `manager`.
3. Carmelo inicia sesión y obtiene rol `operator`.
4. Ambas cuentas ven solo la organización piloto.
5. Catálogo remoto muestra cuatro productos ficticios.
6. Carmelo crea un pedido.
7. Camila lo visualiza en una segunda sesión.
8. Repetir el POST con la misma clave no duplica el pedido.
9. Reutilizar la clave con otro cliente devuelve conflicto.
10. Auditoría contiene un único evento `order.created`.
11. CORS rechaza un origen no autorizado.
12. Cerrar sesión invalida el token.

## Rollback

Frontend:

1. abrir `/conexion`;
2. elegir **Seguir en modo local**;
3. verificar la franja **Modo local**;
4. continuar usando las pantallas locales.

Backend:

- no eliminar la base durante un incidente;
- detener escrituras o desactivar el servicio;
- conservar logs y commit desplegado;
- verificar backup antes de restaurar;
- no importar automáticamente pedidos remotos a `localStorage`.

## Criterio para el siguiente bloque

Solo se conectarán pesaje y estados cuando:

- el hosting esté verificado;
- dos sesiones funcionen simultáneamente;
- la idempotencia esté comprobada en red real;
- exista rollback documentado;
- Camila o Carmelo completen el flujo sin asistencia técnica.
