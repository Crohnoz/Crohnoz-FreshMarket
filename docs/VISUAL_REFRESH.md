# Iteración visual — producto comercial

## Objetivo

Elevar el piloto de Crohnoz Fresh Market desde una demostración funcional hacia una presentación comercial coherente, reconocible y cercana a una verdulería o feria chilena.

## Cambios

- Hero fotográfico en la tienda pública.
- Catálogo con fotografías, etiquetas comerciales y textos alternativos.
- Respaldo mediante emoji si una fotografía no carga.
- Miniaturas dentro del carrito.
- Tarjetas visuales para delivery, pesaje y cajas semanales.
- Contexto fotográfico en el dashboard operacional.
- Miniaturas de productos en pedidos y precios rápidos.
- Contexto visual para el copiloto, fiados e importación del cuaderno.
- Carga diferida para fotografías secundarias.
- Content Security Policy limitada a los dominios visuales aprobados.
- Pruebas para exigir imagen y descripción accesible en todos los productos demo.

## Riesgos conocidos

- Los activos todavía dependen de servicios externos.
- La apariencia final puede variar si un proveedor modifica una URL.
- El piloto no tiene procesamiento automático de imágenes ni CDN propio.
- La versión productiva deberá alojar activos optimizados bajo control de Crohnoz Labs o del comercio.

## Validaciones requeridas

- Navegadores de escritorio y teléfono.
- Modo claro y oscuro.
- Carga con conexión lenta.
- Imágenes bloqueadas o no disponibles.
- Legibilidad de textos sobre fotografías.
- Navegación con teclado y lectura de textos alternativos.
