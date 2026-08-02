# Centro de integridad de datos

## Objetivo

El Centro de Integridad de Crohnoz Fresh Market 0.4.0-pilot revisa la coherencia interna de los datos locales antes de:

- continuar operando después de una falla;
- realizar un cierre diario;
- exportar o restaurar respaldos;
- ejecutar una demostración importante;
- diseñar una migración al backend de Crohnoz Kernel.

El análisis se ejecuta en el navegador, es determinista y no envía información a servicios externos.

## Principio de seguridad

El auditor es de **solo lectura**. Detecta y explica problemas, pero no modifica registros automáticamente. Una reparación automática sin contexto podría eliminar ventas, mover saldos o vincular pagos al registro equivocado.

## Estado efectivo

El piloto combina datos almacenados en `localStorage` con datos demo usados como fallback. Antes de auditar o respaldar, `materializePilotEntries()` construye una instantánea efectiva autosuficiente:

- conserva las colecciones realmente guardadas;
- incorpora valores base cuando una colección nunca se persistió;
- respeta listas vacías guardadas explícitamente;
- evita respaldos parciales y falsos errores por ausencia física de una clave.

## Estados

### Datos coherentes

No se detectaron errores críticos ni advertencias en las reglas actuales.

### Revisión recomendada

No existe un bloqueo matemático o referencial, pero hay información incompleta o potencialmente ambigua. Ejemplos:

- abono sin medio de pago;
- total con diferencia respecto de sus líneas;
- proveedor opcional no encontrado;
- fecha dudosa;
- respaldo antiguo sin checksum.

### Correcciones necesarias

Existen fallas que pueden alterar cálculos, trazabilidad o migración. Ejemplos:

- identificador duplicado o ausente;
- pago vinculado a un pedido inexistente;
- movimiento vinculado a un cliente inexistente;
- compra vinculada a un proveedor inexistente;
- lote con saldo negativo;
- cantidad, precio o costo inválido;
- cierre cuya diferencia no equivale a contado menos esperado;
- colección con tipo de dato incorrecto;
- JSON ilegible en el almacenamiento local.

## Colecciones revisadas

- `business`
- `prices`
- `orders`
- `inventory-lots`
- `suppliers`
- `purchase-orders`
- `order-payments`
- `credit-customers`
- `credit-ledger`
- `daily-transactions`
- `waste`
- `daily-closes`
- `continuity-meta`

Las colecciones de UI o experimentación que no afectan actualmente los cálculos pueden materializarse en el respaldo sin participar todavía en todas las reglas.

## Controles principales

### Identidad

- IDs presentes;
- IDs únicos dentro de cada colección.

### Referencias

- productos existentes;
- pedidos existentes para sus pagos;
- clientes existentes para cargos, abonos y ventas fiadas;
- proveedores existentes para compras y lotes;
- lotes existentes para compras;
- transacciones existentes para referencias del libro de cuentas.

### Valores

- cantidades positivas o no negativas según el contexto;
- costos y precios numéricos;
- totales coherentes con sus líneas;
- stock calculado no negativo;
- límites de crédito válidos;
- medios de pago reconocidos.

### Fechas

- fechas de compra, pago, movimiento, merma y cierre válidas;
- fecha de consumo preferente posterior o igual a la recepción;
- una única revisión final por fecha de cierre.

### Conciliación

- efectivo esperado y contado válidos;
- diferencia igual a `contado - esperado`;
- valor absoluto coherente con la diferencia;
- abonos clasificados antes de cerrar.

## Priorización operacional

La recomendación del inicio aplica esta jerarquía general:

1. confirmación pendiente del cliente;
2. errores críticos de integridad;
3. pedidos por pesar o preparar;
4. pedidos listos para cobrar o entregar;
5. inventario crítico;
6. cierre diario al final de la jornada;
7. advertencias de integridad;
8. respaldo pendiente;
9. cuentas por cobrar;
10. nueva venta.

La confirmación del cliente se mantiene primero porque una diferencia de pesaje puede requerir respuesta inmediata. Un error crítico de datos aparece antes de registrar operaciones adicionales.

## Informe descargable

El Centro de Integridad permite descargar un JSON con:

- versión del informe;
- versión del piloto;
- fecha de generación;
- backend de almacenamiento;
- cantidad de colecciones persistidas y efectivas;
- reglas aplicadas;
- estado y conteos;
- hallazgos, colección, registro y recomendación.

El informe no incluye una copia restaurable de las colecciones y no reemplaza el respaldo.

## Mapeo a producción

Estas reglas deben evolucionar a varias capas complementarias:

### PostgreSQL

- claves primarias;
- claves foráneas;
- `CHECK` constraints;
- índices únicos;
- transacciones;
- columnas `NOT NULL` cuando corresponda.

### Django y DRF

- validadores de modelos;
- serializers;
- servicios transaccionales;
- idempotencia;
- autorización por organización;
- auditoría de cambios.

### Operación

- tareas programadas de reconciliación;
- alertas observables;
- backups cifrados;
- restauraciones ensayadas;
- reportes de inconsistencias;
- reparación con aprobación humana y registro de auditoría.

## Límites

- El auditor solo conoce las reglas implementadas; un resultado limpio no prueba que todos los datos sean verdaderos.
- No detecta fraude, suplantación o errores comerciales que sean internamente coherentes.
- No sustituye contabilidad, inventario físico ni conciliación bancaria.
- No repara automáticamente.
- No debe usarse con datos personales reales mientras el producto siga siendo un piloto local sin autenticación ni cifrado.
