# Copiloto Operacional por Voz

## Objetivo

Reducir al mínimo la escritura, los cálculos mentales y la navegación para operadores con poca experiencia digital.

## Principios UX

1. **Hablar primero:** las tareas frecuentes deben poder iniciarse con voz.
2. **Confirmación obligatoria:** ninguna venta, compra, deuda o abono se registra solo por reconocimiento de voz.
3. **Lectura de vuelta:** el sistema resume en voz y texto lo que entendió.
4. **Sugerencias visibles:** el copiloto propone el siguiente paso, pero no decide por la persona.
5. **Fallback permanente:** teclado, botones grandes y entrada manual siempre disponibles.
6. **Lenguaje cotidiano chileno:** admitir expresiones como “anótale”, “fiado”, “abonó”, “dos lucas”, “medio kilo” y “una malla”.
7. **Trazabilidad:** guardar texto original, interpretación, correcciones y confirmación final en el backend productivo.

## Flujos prioritarios

- “Anótale a Rosa quince mil de fiado.”
- “Pedro abonó cinco lucas.”
- “Vendí cinco kilos de tomate a mil cuatrocientos noventa.”
- “Agrégale tres mallas de papa a cuatro mil quinientos.”
- “¿Cuánto me deben en total?”
- “¿Quién me debe más?”
- “Léeme las cuentas pendientes.”

## Arquitectura del piloto

- `SpeechRecognition` o `webkitSpeechRecognition` cuando el navegador lo soporte.
- `speechSynthesis` para lectura de vuelta.
- Parser local y determinista para comandos frecuentes.
- Panel de propuesta editable.
- Botones Confirmar, Corregir y Cancelar.
- Sin llamada a un modelo externo en esta etapa.

## Arquitectura productiva futura

1. Audio capturado con consentimiento explícito.
2. Transcripción mediante servicio controlado.
3. Interpretación estructurada por IA con esquema JSON estricto.
4. Validación determinista de cantidades, dinero, clientes y productos.
5. Confirmación humana.
6. Escritura transaccional e idempotente.
7. Auditoría completa.

La IA nunca debe modificar saldos, inventario o caja sin confirmación humana y validación de negocio.

## Privacidad

El reconocimiento nativo del navegador puede usar servicios remotos según navegador y plataforma. La interfaz debe advertirlo y no debe permanecer escuchando de forma continua. El modo recomendado es iniciar una captura corta y explícita.

## Limitaciones actuales

- Reconoce un conjunto acotado de intenciones frecuentes.
- No interpreta conversaciones largas.
- No reemplaza una capa de IA productiva.
- Una línea de venta por voz se carga en el formulario, pero la contraparte y el medio de pago deben confirmarse.
- Los datos continúan almacenados en `localStorage` en el piloto.
