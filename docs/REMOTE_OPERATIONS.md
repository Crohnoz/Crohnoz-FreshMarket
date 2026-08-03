# Operaciones remotas · Inventario y pedidos

Fecha de corte: 2 de agosto de 2026.  
Versión: `0.8.0-pilot`.

## Propósito

Persistir en Django las primeras operaciones cotidianas sin mezclar escrituras locales y remotas dentro de una misma pantalla.

Las superficies conectadas son:

- `/inventario-remoto`: lectura de lotes y recepción de inventario;
- `/pedidos-remotos`: catálogo, creación, preparación, cantidades reales y estado listo;
- `/conexion`: sesión, organización activa y resumen del servidor.

Ante un error de red ninguna de estas pantallas escribe silenciosamente en `localStorage`.

## Fuente de verdad

| Superficie | Fuente de verdad |
| --- | --- |
| `/inventario-remoto` | Django/PostgreSQL |
| `/pedidos-remotos` | Django/PostgreSQL |
| `/conexion` | Django para sesión y resumen; navegador para URL/configuración |
| `/ventas`, `/inventario`, `/compras`, `/cuentas`, `/cierre` | `localStorage` del navegador |

La aplicación no sincroniza automáticamente ambas fuentes.

## Contrato de sesión

Toda operación remota exige:

1. modo API activo;
2. URL API válida;
3. token vigente en `sessionStorage`;
4. organización seleccionada;
5. membresía activa con rol suficiente.

Cada petición incluye `Authorization: Token …` y `X-Organization-ID`.

## Catálogo remoto

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

## Recepción de inventario

Solicitud:

```text
POST /api/v1/inventory-lots/receive/
Idempotency-Key: <clave estable>
```

Campos:

- producto activo del negocio autenticado;
- fecha de recepción;
- fecha preferente opcional;
- cantidad recibida positiva;
- costo unitario no negativo;
- calidad `good`, `review` o `damaged`;
- observaciones opcionales.

El servidor:

- fija `quantity_available = quantity_received`;
- crea el lote en estado `active`;
- valida producto y organización;
- rechaza fecha preferente anterior a la recepción;
- registra `inventorylot.received` en la auditoría;
- devuelve el mismo lote ante un reintento idéntico;
- responde `409` si la clave se reutiliza con datos distintos.

Los endpoints genéricos `POST`, `PUT`, `PATCH` y `DELETE` de lotes no son una vía operacional. Un lote no se reemplaza ni se elimina: los ajustes futuros deberán implementarse como movimientos trazables.

## Creación de pedido

Solicitud:

```text
POST /api/v1/orders/
```

Campos enviados:

- `public_id` legible para el operador;
- `customer_name`;
- `notes` con modalidad y observaciones;
- `idempotency_key` generada por el navegador;
- `items` con producto, cantidad solicitada y precio unitario.

Aunque el cliente intente enviar otros valores, el servidor fija:

- `status=confirmed`;
- `payment_method=pending`;
- `source=operator`;
- `actual_quantity=null` hasta la preparación.

Cada producto puede aparecer una sola vez.

## Preparación y control optimista

Los pedidos no aceptan `PUT`, `PATCH` ni `DELETE` genéricos. Usan transiciones explícitas:

```text
POST /api/v1/orders/{id}/start-preparing/
POST /api/v1/orders/{id}/confirm-weighing/
POST /api/v1/orders/{id}/mark-ready/
```

Cada transición exige:

```text
If-Match: <versión visible>
Idempotency-Key: <clave estable>
```

Reglas:

- `confirmed → preparing` mediante `start-preparing`;
- cantidades reales solo en estado `preparing`;
- el pesaje debe incluir exactamente todas las líneas actuales;
- cantidades no pesables deben ser enteras;
- el servidor recalcula totales con cantidades reales;
- `preparing → ready` solo cuando todas las líneas tienen cantidad real;
- cada mutación incrementa `version`;
- una versión obsoleta responde `409` y exige actualizar;
- una clave de transición nunca puede cruzarse entre pedidos.

Eventos de auditoría:

- `order.preparing_started`;
- `order.weighing_confirmed`;
- `order.marked_ready`.

## Idempotencia

La clave se genera antes del primer intento y se conserva mientras no exista una respuesta exitosa.

Resultados:

- primera creación de recurso: `201 Created`;
- primer cambio de estado: `200 OK`;
- mismo envío y misma clave: `200 OK`, mismo recurso y `X-Idempotent-Replay: true`;
- clave reutilizada con contenido distinto: `409 Conflict`;
- clave de pedido usada en otro pedido: `409 Conflict`;
- error de red: el navegador conserva la clave;
- éxito: el navegador rota o elimina la clave.

Esto protege ante doble clic, timeout y respuesta perdida. No reemplaza una cola offline.

## Operaciones que siguen fuera del bloque remoto

- descuento FEFO de inventario al preparar;
- ajustes, mermas y devoluciones como movimientos;
- cobro y conciliación de pagos;
- fiados y abonos;
- entrega final;
- cancelación con motivo;
- cierre diario;
- sincronización offline.

Mantenerlas fuera evita aparentar una integración parcial que todavía no existe.

## Despliegue preparado

El Blueprint `render.yaml` declara recursos exclusivos para Fresh Market:

- servicio web Python;
- PostgreSQL;
- acceso externo directo a la base bloqueado;
- secretos independientes;
- migraciones durante el build compatible con el plan declarado;
- seed inicial de Camila y Carmelo;
- health check de API.

El Blueprint no debe conectarse a bases de KatYta Studio, IncluMe, Administración Edificio u otros productos.

## Validación requerida después del despliegue

1. `GET /health/` responde `ok`.
2. Camila inicia sesión y obtiene rol `manager`.
3. Carmelo inicia sesión y obtiene rol `operator`.
4. Ambas cuentas ven solo la organización piloto.
5. Carmelo registra una recepción remota.
6. Repetir la recepción con la misma clave no crea otro lote.
7. Camila crea un pedido remoto.
8. Carmelo inicia la preparación desde otra sesión.
9. Registra todas las cantidades reales.
10. Camila actualiza y observa el nuevo total y versión.
11. Carmelo marca el pedido listo.
12. Un intento con versión antigua devuelve conflicto.
13. Auditoría contiene un único evento por operación.
14. CORS rechaza un origen no autorizado.
15. Cerrar sesión invalida el token.

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
- no importar automáticamente registros remotos a `localStorage`.

El rollback cambia la fuente de trabajo futura; no borra ni fusiona datos existentes.
