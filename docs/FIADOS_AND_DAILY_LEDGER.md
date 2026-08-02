# Fiados, cobranza y registro diario

## Problema observado

Muchos negocios mantienen un cuaderno informal de fiados. Esto impide conocer con certeza cuánto dinero está prestado, quién concentra la deuda, qué abonos se recibieron y cuánto se vendió realmente durante el día.

También existen operaciones mayoristas o entre comercios donde se multiplican kilos, unidades y precios mentalmente, aumentando los errores y la pérdida de registros.

## Alcance del piloto

- Personas con cuenta.
- Cargos de fiado y abonos.
- Saldo por persona.
- Total bruto pendiente.
- Resumen automático y concentración.
- Venta/compra rápida con múltiples líneas.
- Creación automática de deuda cuando una venta se marca como fiada.
- Foto local del cuaderno.
- Análisis de una transcripción mediante reglas simples.
- Revisión humana obligatoria antes de importar.

## Lo que no hace todavía

- No ejecuta cobranza automática.
- No envía mensajes.
- No calcula intereses.
- No evalúa solvencia.
- No realiza OCR real.
- No sincroniza datos entre equipos.
- No sustituye contabilidad formal.

## Flujo futuro de importación IA

1. Captura de fotografía.
2. Preprocesamiento de imagen.
3. OCR/visión en backend.
4. Extracción estructurada.
5. Puntaje de confianza por línea.
6. Revisión humana obligatoria.
7. Detección de duplicados.
8. Importación auditable.

La imagen no debe enviarse a proveedores externos sin información y autorización claras. Los datos reales requerirán autenticación, cifrado, respaldo, auditoría y eliminación controlada.

## Entidades futuras

- CreditAccount.
- CreditLedgerEntry.
- PaymentPromise.
- CollectionReminder.
- NotebookImport.
- NotebookImportLine.
- DailyTransaction.
- DailyTransactionLine.
- Counterparty.

## Criterio de diseño

El operador debe poder registrar una operación sin hacer cálculos manuales y entender el total prestado en menos de diez segundos.
