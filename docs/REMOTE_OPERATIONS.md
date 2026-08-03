# Operaciones remotas · Inventario y pedidos

Fecha de corte: 3 de agosto de 2026.  
Versión: `0.9.0-pilot`.

## Propósito

Persistir en Django las primeras operaciones cotidianas sin mezclar escrituras locales y remotas dentro de una misma pantalla.

Las superficies conectadas son:

- `/inventario-remoto`: catálogo, recepciones, saldos, movimientos FEFO e historial;
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
- exige cantidades enteras para unidad o paquete;
- rechaza fecha preferente anterior a la recepción;
- registra `inventorylot.received`;
- devuelve el mismo lote ante un reintento idéntico;
- responde `409` si la clave se reutiliza con datos distintos.

Los endpoints genéricos `POST`, `PUT`, `PATCH` y `DELETE` de lotes no son una vía operacional.

## Libro de movimientos de inventario

### Lectura

```text
GET /api/v1/inventory-movements/
GET /api/v1/inventory-movements/?lot=<uuid>
GET /api/v1/inventory-movements/?product=<uuid>
GET /api/v1/inventory-movements/?movement_type=waste
```

Cada registro contiene:

- lote y producto;
- tipo de movimiento;
- saldo anterior;
- variación firmada;
- saldo resultante;
- motivo y referencia;
- actor autenticado;
- fecha;
- versión resultante del lote.

Los movimientos son append-only. `PATCH` y `DELETE` no están disponibles.

### Escritura

```text
POST /api/v1/inventory-movements/
If-Match: <versión visible del lote>
Idempotency-Key: <clave estable>
```

Tipos:

| Tipo | Efecto | Rol mínimo |
| --- | --- | --- |
| `consumption` | descuenta una cantidad utilizada | `operator` |
| `waste` | descuenta merma | `operator` |
| `supplier_return` | descuenta devolución al proveedor | `operator` |
| `adjustment` | fija un nuevo saldo absoluto | `manager` |

Para consumo, merma y devolución se envía:

```json
{
  "lot": "<uuid>",
  "movement_type": "consumption",
  "quantity": "1.250",
  "reason": "Preparación de pedido",
  "reference": "FM-001"
}
```

Para ajuste:

```json
{
  "lot": "<uuid>",
  "movement_type": "adjustment",
  "quantity_available": "7.500",
  "reason": "Conteo físico",
  "reference": "CONTEO-01"
}
```

Respuesta inicial:

```text
201 Created
```

```json
{
  "lot": { "id": "…", "quantity_available": "7.500", "version": 4 },
  "movement": {
    "id": "…",
    "quantity_before": "8.750",
    "quantity_delta": "-1.250",
    "quantity_after": "7.500"
  }
}
```

Replay idéntico:

```text
200 OK
X-Idempotent-Replay: true
```

### Reglas de integridad

- el movimiento y el lote pertenecen a la organización activa;
- la cantidad no puede superar el saldo disponible;
- el saldo resultante nunca puede ser negativo;
- unidad y paquete exigen cantidades enteras;
- un ajuste no puede superar la recepción original;
- un ajuste sin cambio es rechazado;
- un lote agotado no admite nuevas salidas;
- un lote descartado no admite movimientos;
- un lote dañado no puede consumirse, pero sí registrar merma o devolución;
- cada movimiento incrementa la versión del lote;
- una versión obsoleta responde `409`;
- una clave no puede cruzar lotes, tipos ni contenidos;
- una operación exitosa genera un solo movimiento y un solo evento de auditoría.

Eventos:

- `inventorylot.consumed`;
- `inventorylot.wasted`;
- `inventorylot.adjusted`;
- `inventorylot.returned_to_supplier`.

## Prioridad FEFO

Para `consumption`, Django selecciona conceptualmente el primer lote utilizable del producto:

1. estado activo;
2. saldo positivo;
3. calidad distinta de `damaged`;
4. fecha preferente más próxima;
5. sin fecha preferente, recepción más antigua;
6. desempate por creación e ID.

Si el operador intenta consumir un lote posterior, la API responde `400` indicando el lote FEFO que debe usarse primero. La interfaz muestra **FEFO primero** y bloquea preventivamente esa selección.

Cuando el lote prioritario se agota, el siguiente queda habilitado. Un replay ya exitoso conserva su respuesta aunque después aparezca una recepción con fecha anterior.

Esta versión no divide automáticamente una solicitud entre varios lotes. Si el primer lote no alcanza, deben registrarse movimientos separados.

## Creación de pedido

```text
POST /api/v1/orders/
```

Campos enviados:

- `public_id` legible para el operador;
- `customer_name`;
- `notes` con modalidad y observaciones;
- `idempotency_key` generada por el navegador;
- `items` con producto, cantidad solicitada y precio unitario.

El servidor fija:

- `status=confirmed`;
- `payment_method=pending`;
- `source=operator`;
- `actual_quantity=null` hasta la preparación.

Cada producto puede aparecer una sola vez.

## Preparación y control optimista

Los pedidos no aceptan `PUT`, `PATCH` ni `DELETE` genéricos. Usan:

```text
POST /api/v1/orders/{id}/start-preparing/
POST /api/v1/orders/{id}/confirm-weighing/
POST /api/v1/orders/{id}/mark-ready/
```

Cada transición exige `If-Match` e `Idempotency-Key`.

Reglas:

- `confirmed → preparing`;
- cantidades reales solo en `preparing`;
- el pesaje incluye exactamente todas las líneas;
- cantidades no pesables son enteras;
- Django recalcula totales;
- `preparing → ready` exige todas las cantidades reales;
- cada mutación incrementa `version`;
- una versión obsoleta responde `409`;
- una clave de transición no cruza pedidos.

Eventos:

- `order.preparing_started`;
- `order.weighing_confirmed`;
- `order.marked_ready`.

## Idempotencia

La clave se genera antes del primer intento y se conserva mientras no exista respuesta exitosa.

- primera creación: `201 Created`;
- primera transición: `200 OK`;
- replay idéntico: `200 OK` y `X-Idempotent-Replay: true`;
- clave reutilizada con contenido o entidad distinta: `409 Conflict`;
- error de red: se conserva la clave;
- éxito: se rota la clave y se actualiza desde servidor.

Esto protege ante doble clic, timeout y respuesta perdida. No reemplaza una cola offline.

## Operaciones que siguen fuera del bloque remoto

- reparto automático de una salida entre varios lotes FEFO;
- consumo automático enlazado al pedido preparado;
- cobro y conciliación de pagos;
- fiados y abonos;
- entrega final;
- cancelación con motivo;
- cierre diario;
- sincronización offline.

## Despliegue preparado

El Blueprint `render.yaml` declara recursos exclusivos para Fresh Market:

- servicio web Python;
- PostgreSQL;
- acceso externo directo a la base bloqueado;
- secretos independientes;
- migraciones durante el build;
- seed inicial de Camila y Carmelo;
- health check de API.

No debe conectarse a bases de otros productos Crohnoz.

## Validación después del despliegue

1. `GET /health/` responde `ok`.
2. Camila obtiene rol `manager` y Carmelo `operator`.
3. Ambas cuentas ven solo la organización piloto.
4. Carmelo registra dos recepciones del mismo producto.
5. La interfaz marca el lote FEFO.
6. Consumir el lote posterior es rechazado.
7. Carmelo registra consumo, merma y devolución.
8. Ajustar con Carmelo devuelve `403`.
9. Ajustar con Camila crea movimiento y auditoría.
10. Repetir una escritura con la misma clave no duplica.
11. Una versión antigua devuelve conflicto.
12. El historial muestra saldos antes/después y actor.
13. El flujo de pedido funciona entre dos sesiones.
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