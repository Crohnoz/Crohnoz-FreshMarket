# Iteración: cierre diario asistido

Fecha: 2026-08-02

## Entregado

- Ruta `/cierre`.
- Resumen de ventas, compras, fiados, abonos y merma.
- Conciliación de efectivo esperado contra efectivo contado.
- Separación de efectivo, transferencia y crédito.
- Clasificación obligatoria de abonos incompletos.
- Medio de pago persistido al registrar nuevos abonos.
- Checklist humano antes de guardar.
- Guardado local y actualización de cierres por fecha.
- Resumen copiable y lectura en voz alta.
- Tarea `Cerrar el día` en el inicio operacional.
- Acceso móvil permanente al cierre.
- Datos demostrativos del día para evaluar el flujo.
- Pruebas de dominio, página, navegación y clasificación.

## Decisiones

- Una diferencia de caja no bloquea el guardado si fue revisada; queda marcada.
- Un abono sin medio de pago sí bloquea el guardado porque impide calcular el efectivo esperado.
- Una venta fiada vinculada al libro de cuentas se cuenta una sola vez.
- El cierre local puede actualizarse; el backend productivo deberá usar snapshots inmutables y reapertura autorizada.

## Pendiente físico

- Probar conteo y cierre en teléfono Android.
- Evaluar el flujo con una persona operadora real.
- Confirmar comprensión de los términos `caja inicial`, `retiro` y `diferencia`.
- Medir tiempo de cierre y errores sin asistencia externa.
