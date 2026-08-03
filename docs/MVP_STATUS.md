# Estado del MVP · Crohnoz Fresh Market

Fecha de corte: 2 de agosto de 2026.

## Lectura ejecutiva

El producto tiene tres porcentajes distintos y no deben confundirse:

| Alcance | Avance estimado | Interpretación |
|---|---:|---|
| Piloto navegable y demostrable | 94% | La experiencia visual, flujos principales, conexión y operación remota pueden recorrerse con datos ficticios. |
| MVP real para Camila y Carmelo | 74% | Django, sesión, catálogo remoto y pedidos idempotentes están implementados; faltan crear/verificar el hosting, migrar más operaciones y validar presencialmente. |
| Producto comercial endurecido | 43% | Existe base multiempresa, RBAC, auditoría, sesión finita e infraestructura declarativa, pero faltan backups verificados, observabilidad, privacidad, soporte y preparación tributaria. |

Los porcentajes son una estimación de gestión basada en entregables verificables, no una medición automática de líneas de código.

## Desglose del MVP real

| Bloque | Peso | Estado | Aporte actual |
|---|---:|---:|---:|
| Descubrimiento, alcance y UX/UI | 20% | 95% | 19% |
| Flujos operacionales del frontend | 25% | 92% | 23% |
| Reglas de negocio, integridad y continuidad | 15% | 90% | 13,5% |
| Backend, API y persistencia | 20% | 72% | 14,4% |
| Seguridad mínima y despliegue | 10% | 42% | 4,2% |
| Validación real con usuarios | 10% | 0% | 0% |
| **Total redondeado** | **100%** |  | **74%** |

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
- Reintentos de pedidos idempotentes sin duplicación.
- Conflicto explícito cuando una clave se reutiliza con otro contenido.
- Blueprint aislado para servicio Django y PostgreSQL.
- CI dual para frontend y backend.

## Incremento completado en `0.7.0-pilot`

- nueva ruta `/pedidos-remotos`;
- repositorio API sin fallback local;
- normalización defensiva de productos y pedidos;
- paginación remota limitada;
- creación de pedidos con clave estable durante reintentos;
- replay seguro `201 → 200` para la misma solicitud;
- `409` ante colisión de idempotencia;
- una sola auditoría `order.created`;
- filtro `is_active` en catálogo;
- Blueprint `render.yaml` con recursos exclusivos;
- soporte `DATABASE_URL`;
- WhiteNoise y build reproducible;
- migraciones previas y seed inicial declarado;
- caché del shell remoto sin prometer operación offline.

## Fuentes de verdad actuales

| Dominio | Fuente |
|---|---|
| Sesión, membresía y organización | Django |
| Catálogo y pedidos en `/pedidos-remotos` | Django/PostgreSQL cuando la API esté disponible |
| Venta rápida, pesaje, inventario, compras, pagos, fiados y cierre | `localStorage` |
| Configuración de URL y modo | `localStorage` |
| Token e identidad temporal | `sessionStorage` |

La franja superior muestra el estado de conexión para evitar que el operador interprete erróneamente que todo ya está sincronizado.

## Lo que todavía falta verificar

- crear la instancia desde el Blueprint;
- confirmar build, migraciones, seed y health check reales;
- verificar backups del proveedor;
- restringir CSP al hostname definitivo;
- probar CORS desde Netlify y rechazo desde otros orígenes;
- probar dos sesiones simultáneas;
- comprobar idempotencia bajo pérdida de respuesta real;
- registrar latencia y errores del hosting.

## Lo que todavía sigue local

- venta rápida;
- preparación, pesaje y transiciones de pedido;
- cambios de precio;
- recepción y ajustes de inventario;
- pagos y fiados;
- cierre diario;
- respaldos operacionales.

## Próximo incremento crítico

1. crear el Blueprint en Render e ingresar secretos por canal seguro;
2. verificar PostgreSQL, migraciones, seed y health check;
3. configurar la URL en `/conexion`;
4. crear un pedido con Carmelo;
5. verlo desde una segunda sesión de Camila;
6. repetir la solicitud para verificar que no se duplique;
7. fijar CSP al hostname exacto;
8. documentar backup y rollback observados.

Después de verificar hosting y dos sesiones reales, el MVP debería alcanzar aproximadamente **79%**. Con pesaje y estados de pedido remotos, debería acercarse a **83%**.

## Criterio de MVP para Camila y Carmelo

El MVP se considera listo para la primera prueba real cuando:

1. ambos tienen cuentas separadas;
2. cada acción queda asociada a un usuario y organización;
3. productos y pedidos persisten en PostgreSQL;
4. la interfaz conserva los mismos flujos simples;
5. se puede operar desde dos sesiones sin perder ni mezclar datos;
6. existe un respaldo antes de la prueba;
7. errores y comentarios se registran durante los escenarios;
8. no se ingresan datos sensibles innecesarios.

## Escenarios de validación

Camila y Carmelo deben intentar, sin entrenamiento técnico prolongado:

1. ingresar y reconocer su nombre, rol y negocio;
2. consultar el catálogo remoto;
3. crear un pedido remoto;
4. verificarlo desde la segunda cuenta;
5. registrar una recepción de inventario local;
6. preparar y pesar un pedido local;
7. cobrarlo o dejarlo fiado localmente;
8. cerrar el día;
9. recuperar una tarea después de salir y volver a entrar.

Se medirá éxito, tiempo, errores, dudas, retrocesos y necesidad de ayuda. La opinión estética se registrará, pero tendrá menor peso que la capacidad de completar la tarea.
