# Crohnoz Fresh Market — cierre de los cinco bloques del piloto

## Estado

Esta iteración completa el alcance funcional del **piloto comercial estático**. No convierte el sistema en producción: continúa sin autenticación, backend, sincronización multi-dispositivo ni garantías transaccionales.

## 1. Inventario perecible por lotes

Cada recepción conserva producto, cantidad, unidad, costo, proveedor, fecha de recepción, fecha de consumo preferente, condición y maduración. La salida se ordena mediante FEFO ajustado por riesgo.

Reglas:

- un lote crítico se vende o procesa antes;
- una salida no puede superar el saldo disponible;
- merma y venta se registran por separado;
- el valor en riesgo es costo estimado, no precio de venta ni pérdida contable certificada.

## 2. Compras y precios diarios

Una compra crea simultáneamente:

- un registro de proveedor;
- una referencia de costo unitario;
- un lote de inventario;
- una sugerencia de precio.

La sugerencia protege un margen objetivo y una reserva por merma. No se aplica salvo selección explícita.

## 3. Venta, cobro y entrega

El flujo de pedidos conserva cantidad solicitada y real, exige confirmación cuando el pesaje supera las reglas, permite transiciones controladas y registra pagos en efectivo, transferencia o fiado.

Los comprobantes son internos y contienen la advertencia de que **no son boletas tributarias**.

## 4. Preparación para IA real

El centro asistido separa:

1. contexto operativo;
2. interpretación;
3. nivel de confianza;
4. evidencia local;
5. propuesta estructurada;
6. revisión humana;
7. aplicación explícita.

La versión actual es determinista. La foto del cuaderno permanece local y solo una transcripción revisada crea propuestas.

El contrato futuro está definido en `docs/contracts/assistant-proposal.schema.json`.

## 5. Hardening y validación

Se incorporan:

- service worker y fallback sin conexión;
- manifest de aplicación;
- enlace para saltar al contenido;
- aviso de conectividad;
- reducción de movimiento según preferencia del sistema;
- soporte de alto contraste;
- hoja de impresión limpia;
- diagnóstico del dispositivo;
- guion de cinco escenarios críticos;
- historial local de pruebas de usuario.

## Criterio de salida del piloto

El piloto puede presentarse comercialmente cuando:

- CI está verde;
- las rutas públicas responden;
- las tareas principales son navegables;
- al menos una prueba física se ejecuta en Android;
- venta, fiado, abono, pesaje y cierre se completan sin ayuda crítica;
- micrófono, cámara y lector se prueban con hardware real;
- los problemas críticos quedan documentados.

## Lo que todavía falta para producción

- Django/DRF/PostgreSQL;
- organizaciones y aislamiento de datos;
- autenticación, RBAC y auditoría;
- transacciones e idempotencia;
- almacenamiento privado de imágenes;
- OCR/IA en backend con secretos protegidos;
- respaldos, observabilidad y recuperación;
- integración tributaria y medios de pago reales;
- privacidad, retención y eliminación de datos;
- pruebas de seguridad y accesibilidad formales.
