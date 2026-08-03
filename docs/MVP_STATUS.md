# Estado del MVP · Crohnoz Fresh Market

Fecha de corte: 3 de agosto de 2026.

## Lectura ejecutiva

El producto tiene tres porcentajes distintos y no deben confundirse:

| Alcance | Avance estimado | Interpretación |
|---|---:|---|
| Piloto navegable y demostrable | 97% | La experiencia visual, conexión, recepción, movimientos de inventario y preparación remota pueden recorrerse con datos ficticios. |
| MVP real para Camila y Carmelo | 82% | Django cubre sesión, catálogo, lotes, movimientos FEFO, pedidos, pesaje y estado listo; faltan desplegar/verificar la API, conectar pagos y validar con usuarios reales. |
| Producto comercial endurecido | 49% | Existe base multiempresa, RBAC, auditoría, control optimista, idempotencia, libro de inventario e infraestructura declarativa, pero faltan backups verificados, observabilidad, privacidad, soporte y preparación tributaria. |

Los porcentajes son una estimación de gestión basada en entregables verificables, no una medición automática de líneas de código.

## Desglose del MVP real

| Bloque | Peso | Estado | Aporte actual |
|---|---:|---:|---:|
| Descubrimiento, alcance y UX/UI | 20% | 97% | 19,4% |
| Flujos operacionales del frontend | 25% | 97% | 24,3% |
| Reglas de negocio, integridad y continuidad | 15% | 96% | 14,4% |
| Backend, API y persistencia | 20% | 93% | 18,6% |
| Seguridad mínima y despliegue | 10% | 50% | 5,0% |
| Validación real con usuarios | 10% | 0% | 0% |
| **Total redondeado** | **100%** |  | **82%** |

## Lo que ya está listo

- Inicio operacional guiado.
- Catálogo y tienda pública local.
- Preparación, pesaje y confirmación de diferencias local.
- Inventario perecible por lotes y priorización FEFO local.
- Compras, costos, precios sugeridos y proveedores local.
- Ventas, cobros, entregas y comprobante interno local.
- Fiados, abonos y saldos local.
- Cierre diario y conciliación de caja local.
- Integridad local, respaldo, restauración y auditoría encadenada.
- Navegación móvil, modo fácil, confirmaciones y acciones reversibles.
- Fundación Django con organizaciones, roles, catálogo, lotes, movimientos, pedidos y auditoría servidor.
- Pantalla de conexión con health check, login, logout, selección de organización y resumen.
- Sesión almacenada solo durante la pestaña y token con vencimiento servidor.
- Comando seguro para preparar cuentas separadas de Camila y Carmelo.
- Catálogo remoto filtrado por producto activo y organización.
- Recepción remota idempotente de inventario.
- Libro remoto e inmutable de consumo, merma, ajuste y devolución.
- Prioridad FEFO transaccional para consumo.
- Preparación remota `confirmed → preparing → ready`.
- Registro obligatorio de todas las cantidades reales.
- Recálculo servidor de líneas y total.
- Control de versión mediante `If-Match`.
- Reintentos idempotentes sin duplicación ni cruce entre registros.
- Bloqueo de mutaciones genéricas destructivas en lotes, movimientos y pedidos.
- Blueprint aislado para servicio Django y PostgreSQL.
- CI dual para frontend y backend.

## Incremento `0.9.0-pilot`

### Libro remoto de inventario

- modelo `InventoryMovement` append-only;
- migración dedicada;
- saldo anterior, variación y saldo resultante;
- motivo, referencia, actor y fecha;
- consumo, merma, ajuste y devolución a proveedor;
- consumo, merma y devolución disponibles para operador;
- ajuste absoluto limitado a `manager` y `owner`;
- historial filtrable por lote, producto y tipo;
- `PATCH` y `DELETE` no disponibles;
- una sola auditoría por movimiento exitoso.

### Integridad operacional

- `If-Match` obligatorio para detectar saldos obsoletos;
- `Idempotency-Key` obligatoria y única por organización;
- replay seguro del mismo movimiento;
- conflicto ante reutilización de clave con otro contenido o lote;
- bloqueo transaccional por organización y lote;
- rechazo de sobreconsumo y saldo negativo;
- cantidades enteras para unidad y paquete;
- lote dañado excluido del consumo;
- ajuste incapaz de superar la recepción original;
- lote agotado cerrado para nuevas salidas.

### FEFO

- la interfaz identifica el lote **FEFO primero**;
- Django rechaza consumir un lote posterior mientras exista uno utilizable con mayor prioridad;
- los lotes dañados no bloquean el siguiente lote apto;
- al agotarse el primero, el siguiente queda habilitado;
- un replay ya exitoso permanece válido aunque después aparezca un lote con fecha anterior.

El consumo todavía se registra contra un lote explícito. No existe reparto automático de una misma cantidad entre varios lotes.

## Fuentes de verdad actuales

| Dominio | Fuente |
|---|---|
| Sesión, membresía y organización | Django |
| Catálogo remoto | Django/PostgreSQL cuando la API esté disponible |
| Recepciones, saldos y movimientos en `/inventario-remoto` | Django/PostgreSQL |
| Pedidos, preparación y cantidades reales en `/pedidos-remotos` | Django/PostgreSQL |
| Venta rápida, pagos, fiados y cierre | `localStorage` |
| Inventario y preparación en pantallas históricas | `localStorage`, explícitamente separado |
| Configuración de URL y modo | `localStorage` |
| Token e identidad temporal | `sessionStorage` |

La franja superior y los textos de cada superficie señalan la fuente para evitar una falsa impresión de sincronización total.

## Lo que todavía falta verificar

- crear la instancia desde el Blueprint;
- confirmar build, migraciones, seed y health check reales;
- verificar backups del proveedor;
- restringir CSP al hostname definitivo;
- probar CORS desde Netlify y rechazo desde otros orígenes;
- probar dos sesiones simultáneas;
- comprobar idempotencia, FEFO y control de versión bajo pérdida de respuesta real;
- registrar latencia y errores del hosting.

## Lo que todavía sigue local

- venta rápida;
- cobro y entrega final;
- cambios de precio;
- pagos y fiados;
- cierre diario;
- respaldos operacionales.

## Próximo incremento crítico

1. crear el Blueprint e ingresar secretos por canal seguro;
2. verificar PostgreSQL, migraciones, seed y health check;
3. configurar la URL en `/conexion`;
4. registrar dos lotes del mismo producto y comprobar FEFO entre dos sesiones;
5. crear, preparar, pesar y marcar listo un pedido;
6. comprobar conflictos de versión y reintentos reales;
7. fijar CSP al hostname exacto;
8. documentar backup y rollback observados.

Después de verificar hosting y dos sesiones reales, el MVP debería alcanzar aproximadamente **86%**. Los siguientes incrementos de mayor valor serán vincular consumo con pedidos, repartir automáticamente entre lotes FEFO y conectar cobro/entrega remotos.

## Criterio de MVP para Camila y Carmelo

El MVP se considera listo para la primera prueba real cuando:

1. ambos tienen cuentas separadas;
2. cada acción queda asociada a usuario y organización;
3. productos, lotes, movimientos y pedidos persisten en PostgreSQL;
4. la interfaz conserva flujos simples;
5. dos sesiones operan sin perder ni mezclar datos;
6. existe un respaldo antes de la prueba;
7. errores y comentarios se registran durante los escenarios;
8. no se ingresan datos sensibles innecesarios.

## Escenarios de validación

Camila y Carmelo deben intentar, sin entrenamiento técnico prolongado:

1. ingresar y reconocer nombre, rol y negocio;
2. registrar dos recepciones del mismo producto;
3. identificar el lote FEFO prioritario;
4. registrar consumo, merma y devolución;
5. comprobar que solo Camila puede ajustar un saldo;
6. crear un pedido remoto;
7. abrirlo desde la segunda cuenta;
8. comenzar preparación, registrar cantidades y marcar listo;
9. provocar una actualización obsoleta y comprender el mensaje;
10. volver a modo local sin borrar datos remotos.

Se medirá éxito, tiempo, errores, dudas, retrocesos y necesidad de ayuda. La opinión estética se registrará, pero tendrá menor peso que la capacidad de completar la tarea.