# Crohnoz Fresh Market

Software vertical de **Crohnoz Labs** para verdulerías, fruterías y comercios de productos frescos. Reutiliza patrones de experiencia de **Crohnoz Sushi** y reserva capacidades transversales para **Crohnoz Kernel**.

## Estado

**Piloto comercial funcionalmente completo, pendiente de validación física.** La interfaz usa datos ficticios y `localStorage`. No existe autenticación, persistencia central, aislamiento multiempresa ni garantía transaccional.

## Páginas

- `/index.html`: tienda pública.
- `/operar.html`: inicio guiado por tareas.
- `/admin.html`: preparación, pesaje, precios rápidos y merma.
- `/cuentas.html`: fiados, abonos, operaciones rápidas y voz.
- `/cierre.html`: conciliación diaria de efectivo.
- `/inventario.html`: inventario perecible por lotes y prioridad FEFO.
- `/compras.html`: proveedores, costos, recepción y precio sugerido.
- `/ventas.html`: confirmación, cobro, entrega y comprobante interno.
- `/asistente.html`: contexto operacional y propuestas revisables.
- `/validacion.html`: diagnóstico técnico y pruebas de usuario.
- `/configurador.html`: identidad y parámetros demo.
- `/scanner-lab.html`: laboratorio HID para lector de códigos.

Alias Netlify: `/operar`, `/inventario`, `/compras`, `/ventas`, `/asistente`, `/validacion`, `/cierre`, `/dashboard`, `/cuentas`, `/configurar` y `/scanner`.

## Cinco bloques completados

### Inventario perecible

- lotes por recepción;
- costo, condición y maduración;
- fecha de consumo preferente;
- saldo por lote;
- venta, merma y ajuste;
- prioridad FEFO y valor en riesgo.

### Compras y precios

- proveedores demo;
- costo unitario;
- historial de compras;
- creación automática de lote;
- sugerencia por margen y merma;
- aplicación de precio solo con confirmación.

### Venta completa

- historial de pedidos;
- cantidades solicitadas y reales;
- confirmación de diferencias;
- transiciones de preparación y entrega;
- pagos en efectivo, transferencia o fiado;
- comprobante interno no tributario.

### Asistencia preparada para IA

- contexto de inventario, deuda, compras y cierres;
- respuesta con confianza y evidencia;
- cola de propuestas;
- aprobación o rechazo humano;
- importación desde transcripción revisada;
- contrato JSON Schema para backend futuro.

### Hardening del piloto

- service worker y fallback offline;
- manifest instalable;
- enlace de salto, alto contraste y movimiento reducido;
- aviso de conectividad;
- diagnóstico de capacidades;
- cinco escenarios cronometrados;
- historial local de validación.

## Ejecutar

```bash
python -m http.server 8000
```

Abrir `http://localhost:8000/operar.html`.

## Pruebas

```bash
npm test
```

La suite cubre mediciones, pesaje, códigos de barra, fiados, voz, imágenes, cierre diario, inventario, compras, márgenes, flujo de pedidos, propuestas asistidas, rutas y validación del piloto.

## Seguridad y límites

- No ingresar datos reales o sensibles.
- `localStorage` no sincroniza dispositivos y puede perderse.
- El service worker mejora continuidad local, pero no constituye respaldo.
- La voz y cámara dependen del navegador y permisos del usuario.
- El soporte del escáner debe probarse físicamente.
- Las fotografías externas son del piloto y deben migrarse a infraestructura controlada.
- Los precios son sugerencias, no decisiones automáticas.
- El comprobante interno no es documento tributario.
- El cierre no reemplaza contabilidad formal ni conciliación bancaria.
- La IA actual es determinista y no llama a un modelo externo.

La separación entre piloto y producción está documentada en `docs/PILOT_COMPLETION.md`.

## Producción futura

Django, DRF, PostgreSQL, autenticación, organizaciones, RBAC, auditoría, transacciones, idempotencia, almacenamiento privado, OCR/IA backend, backups, observabilidad, privacidad, pagos e integración tributaria.

## Referencia de reutilización

Repositorio revisado: `Crohnoz/Crohnoz-Sushi`  
Commit de referencia: `1a4e1df6591eb9d5b00cc333bdc83a63222bceb1`
