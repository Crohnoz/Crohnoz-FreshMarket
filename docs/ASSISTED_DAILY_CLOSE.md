# Cierre diario asistido

## Propósito

El cierre diario de Crohnoz Fresh Market ayuda a una persona operadora a responder cuatro preguntas simples:

1. ¿Cuánto vendí hoy?
2. ¿Cuánto dinero debería haber físicamente en la caja?
3. ¿Cuánto dinero conté realmente?
4. ¿Qué debo revisar si existe una diferencia?

No reemplaza contabilidad formal, conciliación bancaria, declaraciones tributarias ni revisión profesional.

## Fuentes del piloto

El resumen usa datos guardados localmente en el navegador:

- `daily-transactions`: ventas y compras.
- `credit-ledger`: nuevos fiados y abonos.
- `waste`: merma registrada.
- `daily-closes`: copias de cierres anteriores.

La versión productiva deberá consultar datos persistentes, multiempresa y auditables desde el backend.

## Clasificación de dinero

### Afecta la caja física

- Caja inicial.
- Ventas pagadas en efectivo.
- Abonos pagados en efectivo.
- Otros ingresos en efectivo declarados por la persona.
- Compras pagadas en efectivo.
- Gastos pagados en efectivo.
- Retiros de caja.

### No afecta la caja física

- Transferencias.
- Ventas fiadas.
- Fiados anotados manualmente.
- Compras pagadas por transferencia.
- Merma.

Estos movimientos se informan porque afectan ventas, deuda, inventario o resultado operacional, pero no se suman al efectivo contado.

## Fórmula operacional

```text
Efectivo esperado =
  caja inicial
  + ventas en efectivo
  + abonos en efectivo
  + otros ingresos en efectivo
  - compras en efectivo
  - gastos en efectivo
  - retiros de caja
```

```text
Diferencia = efectivo contado - efectivo esperado
```

Una diferencia dentro de la tolerancia configurada se muestra como conciliada. Una diferencia mayor no impide guardar el cierre, pero queda marcada para revisión.

## Registros sin clasificar

Los abonos históricos que no incluyen `settlement` no se asignan automáticamente a efectivo o transferencia. La pantalla obliga a clasificarlos antes de habilitar el guardado.

Esta decisión evita que el sistema invente un saldo de caja.

## Duplicación de ventas fiadas

Una venta marcada como fiada crea:

- una transacción diaria;
- un cargo asociado en el libro de cuentas.

El cierre usa la transacción para sumar la venta fiada y excluye el cargo vinculado mediante `source: daily-transaction`, evitando contar el mismo dinero dos veces.

## Guardado del cierre

Para guardar se requiere:

- efectivo contado;
- abonos clasificados;
- confirmación de ventas y compras;
- confirmación de gastos y retiros;
- confirmación de conteo físico.

El cierre guardado contiene una instantánea del resumen, conciliación, observaciones, checklist y fecha de generación. En el piloto puede actualizarse el mismo día y permanece únicamente en `localStorage`.

## Asistencia por voz

La síntesis de voz lee un resumen determinista del cierre. No utiliza un modelo externo ni modifica datos. La persona debe seguir revisando los montos visibles.

## Evolución productiva

La versión backend deberá incorporar:

- caja y turno por organización y local;
- apertura y cierre con usuario responsable;
- métodos de pago normalizados;
- gastos y retiros como movimientos auditables;
- conciliación con pasarela y cuenta bancaria;
- snapshots inmutables y reapertura autorizada;
- correlación entre venta, pago, fiado y comprobante;
- exportación contable;
- permisos RBAC;
- idempotencia y transacciones de base de datos;
- eventos de auditoría para cada corrección.
