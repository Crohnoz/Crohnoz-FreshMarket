# Operación guiada y navegación móvil

## Problema observado

Los operadores objetivo pueden perderse entre pantallas, tener dificultades para recordar dónde registrar cada movimiento y cometer errores al calcular mentalmente cantidades, precios, fiados y abonos.

## Decisión de producto

Crohnoz Fresh Market incorpora una capa de operación guiada basada en tareas, no en módulos técnicos.

La nueva portada `/operar` pregunta **¿Qué necesitas hacer?** y ofrece accesos grandes a:

- Nueva venta.
- Venta fiada.
- Recibir un abono.
- Anotar un fiado.
- Preparar pedidos.
- Cambiar precios.
- Hablar con el copiloto.
- Probar el lector.

## Principios UX

1. Una tarea principal por acción.
2. Lenguaje cotidiano y verbos claros.
3. Cálculos automáticos con revisión humana.
4. Navegación inferior estable en teléfonos.
5. Modo fácil persistente con tipografía y controles mayores.
6. Recorrido inicial breve, repetible y descartable.
7. Ninguna operación monetaria se confirma automáticamente.

## Enlaces profundos

La portada operacional puede abrir directamente un formulario preconfigurado:

- `cuentas.html?task=sale#transaction-form`
- `cuentas.html?task=credit-sale#transaction-form`
- `cuentas.html?task=payment#ledger-form`
- `cuentas.html?task=charge#ledger-form`
- `cuentas.html?task=voice#voice-copilot`

La capa guiada muestra una instrucción contextual, desplaza la pantalla al formulario y posiciona el foco en el campo siguiente.

## Seguridad y privacidad

- El copiloto requiere activación explícita.
- La política de permisos autoriza cámara y micrófono solo al propio dominio.
- La geolocalización permanece deshabilitada.
- El piloto continúa usando datos ficticios y `localStorage`.
- El modo fácil es una preferencia visual, no un rol ni un permiso.

## Validación pendiente

- Prueba con operadores reales y teléfonos Android económicos.
- Medición de tiempo para completar venta, fiado y abono.
- Pruebas con baja alfabetización digital.
- Contraste, zoom, lectores de pantalla y navegación por teclado.
- Confirmación física del micrófono y lector USB.
