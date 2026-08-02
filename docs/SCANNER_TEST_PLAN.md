# Plan de pruebas — lector USB

## Hipótesis

El dispositivo se comporta como teclado USB HID y emite un terminador Enter, Tab o ninguno. La hipótesis no implica compatibilidad confirmada.

## Matriz mínima

- EAN-13 válido e inválido.
- EAN-8 válido e inválido.
- UPC-A válido e inválido.
- Código alfanumérico.
- Escritura humana lenta.
- Escaneo rápido.
- Código repetido dentro y fuera de la ventana anti-duplicado.
- Enter, Tab y timeout sin terminador.
- Foco en body, botón y campo de texto.
- Desconexión y reconexión.
- Cien lecturas consecutivas.

## Aceptación física

- Cero pérdidas en cien lecturas consecutivas bajo la configuración registrada.
- Cero duplicados no intencionales.
- La escritura humana normal no se clasifica como escaneo.
- La interfaz continúa operando al desconectar el lector.
- El diagnóstico puede exportarse en JSON.
