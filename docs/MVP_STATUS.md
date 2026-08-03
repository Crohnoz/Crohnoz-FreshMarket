# Estado del MVP · Crohnoz Fresh Market

Fecha de corte: 2 de agosto de 2026.

## Lectura ejecutiva

El producto tiene tres porcentajes distintos y no deben confundirse:

| Alcance | Avance estimado | Interpretación |
|---|---:|---|
| Piloto navegable y demostrable | 96% | La experiencia visual, conexión, recepción remota y preparación remota pueden recorrerse con datos ficticios. |
| MVP real para Camila y Carmelo | 79% | Django cubre sesión, catálogo, recepción, pedidos, pesaje y estado listo; faltan desplegar/verificar la API, completar movimientos/pagos y validar con usuarios reales. |
| Producto comercial endurecido | 46% | Existe base multiempresa, RBAC, auditoría, control optimista, idempotencia e infraestructura declarativa, pero faltan backups verificados, observabilidad, privacidad, soporte y preparación tributaria. |

Los porcentajes son una estimación de gestión basada en entregables verificables, no una medición automática de líneas de código.

## Desglose del MVP real

| Bloque | Peso | Estado | Aporte actual |
|---|---:|---:|---:|
| Descubrimiento, alcance y UX/UI | 20% | 96% | 19,2% |
| Flujos operacionales del frontend | 25% | 95% | 23,8% |
| Reglas de negocio, integridad y continuidad | 15% | 94% | 14,1% |
| Backend, API y persistencia | 20% | 86% | 17,2% |
| Seguridad mínima y despliegue | 10% | 47% | 4,7% |
| Validación real con usuarios | 10% | 0% | 0% |
| **Total redondeado** | **100%** |  | **79%** |

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
- Fundación Django con organizaciones, roles, catálogo, lotes, pedidos y auditoría servidor.
- Pantalla de conexión con prueba de salud, login, logout, selección de organización y resumen del servidor.
- Sesiones almacenadas solo durante la pestaña y tokens con vencimiento máximo de 12 horas por defecto.
- Comando seguro para preparar cuentas separadas de Camila y Carmelo sin contraseñas predeterminadas.
- Catálogo remoto filtrado por productos activos y organización.
- Creación y listado de pedidos remotos en una pantalla separada.
- Recepción remota de inventario con lotes trazables.
- Preparación remota con estados `confirmed → preparing → ready`.
- Registro obligatorio de todas las cantidades reales.
- Recalculo servidor de líneas y total del pedido.
- Control de versión mediante `If-Match`.
- Reintentos idempotentes sin duplicación ni cruce entre registros.
- Bloqueo de `PUT`, `PATCH` y `DELETE` genéricos en lotes y pedidos.
- Blueprint aislado para servicio Django y PostgreSQL.
- CI dual para frontend y backend.

## Incremento completado en `0.8.0-pilot`

### Inventario remoto

- nueva ruta `/inventario-remoto`;
- catálogo remoto como base para recepción;
- cantidad, costo, calidad y fechas validados;
- creación idempotente de lotes;
- riesgo visual por calidad y fecha preferente;
- auditoría `inventorylot.received`;
- lotes inmutables por endpoints genéricos.

### Preparación remota

- unidad de venta incorporada en cada línea;
- acción `start-preparing`;
- acción `confirm-weighing`;
- acción `mark-ready`;
- versión obligatoria para cada transición;
- todas las líneas requeridas en el pesaje;
- cantidades enteras en unidades no pesables;
- total recalculado por Django;
- claves de reintento aisladas por pedido;
- auditorías separadas por transición;
- pedido creado siempre como `confirmed/pending/operator`;
- rechazo de cantidades reales prellenadas.

## Fuentes de verdad actuales

| Dominio | Fuente |
|---|---|
| Sesión, membresía y organización | Django |
| Catálogo remoto | Django/PostgreSQL cuando la API esté disponible |
| Recepciones y lotes en `/inventario-remoto` | Django/PostgreSQL |
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
- comprobar idempotencia y control de versión bajo pérdida de respuesta real;
- registrar latencia y errores del hosting.

## Lo que todavía sigue local

- venta rápida;
- cobro y entrega final;
- cambios de precio;
- ajustes, mermas y devoluciones de inventario;
- descuento FEFO durante preparación;
- pagos y fiados;
- cierre diario;
- respaldos operacionales.

## Próximo incremento crítico

1. crear el Blueprint e ingresar secretos por canal seguro;
2. verificar PostgreSQL, migraciones, seed y health check;
3. configurar la URL en `/conexion`;
4. registrar una recepción con Carmelo;
5. verla desde la sesión de Camila;
6. crear, preparar, pesar y marcar listo un pedido entre dos sesiones;
7. comprobar un conflicto de versión real;
8. fijar CSP al hostname exacto;
9. documentar backup y rollback observados.

Después de verificar hosting y dos sesiones reales, el MVP debería alcanzar aproximadamente **84%**. Los siguientes incrementos de mayor valor serán movimientos FEFO y pagos remotos.

## Criterio de MVP para Camila y Carmelo

El MVP se considera listo para la primera prueba real cuando:

1. ambos tienen cuentas separadas;
2. cada acción queda asociada a un usuario y organización;
3. productos, lotes y pedidos persisten en PostgreSQL;
4. la interfaz conserva flujos simples;
5. se puede operar desde dos sesiones sin perder ni mezclar datos;
6. existe un respaldo antes de la prueba;
7. errores y comentarios se registran durante los escenarios;
8. no se ingresan datos sensibles innecesarios.

## Escenarios de validación

Camila y Carmelo deben intentar, sin entrenamiento técnico prolongado:

1. ingresar y reconocer su nombre, rol y negocio;
2. consultar el catálogo remoto;
3. registrar una recepción remota;
4. crear un pedido remoto;
5. abrirlo desde la segunda cuenta;
6. comenzar preparación;
7. registrar cantidades reales;
8. marcar el pedido listo;
9. provocar una actualización obsoleta y comprender el mensaje;
10. volver a modo local sin borrar datos remotos.

Se medirá éxito, tiempo, errores, dudas, retrocesos y necesidad de ayuda. La opinión estética se registrará, pero tendrá menor peso que la capacidad de completar la tarea.
