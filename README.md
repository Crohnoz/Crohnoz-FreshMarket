# Crohnoz Fresh Market

Software vertical de **Crohnoz Labs** para verdulerías, fruterías y comercios de productos frescos. Reutiliza patrones de experiencia de **Crohnoz Sushi** y reserva las capacidades compartidas para **Crohnoz Kernel**.

## Estado

**Piloto comercial v0.1 en construcción.** La interfaz es navegable y usa datos ficticios guardados en el navegador. No existe autenticación, persistencia central ni seguridad multiempresa en esta fase.

La presentación comercial incluye fotografías de productos, cajas y operación cotidiana, catálogo visual, carga diferida, texto alternativo y respaldo visual cuando una imagen externa no está disponible.

## Páginas

- `/index.html`: tienda pública.
- `/operar.html`: inicio guiado del negocio con tareas grandes y resumen operacional.
- `/admin.html`: dashboard operacional y pesaje.
- `/cuentas.html`: libro de fiados, abonos, registro rápido de operaciones y copiloto por voz.
- `/configurador.html`: identidad del negocio y configuración demo.
- `/scanner-lab.html`: laboratorio de lector USB tipo teclado HID.

Netlify también expone alias:

- `/operar`
- `/dashboard`
- `/cuentas`
- `/configurar`
- `/scanner`

## Operación guiada

La capa guiada prioriza acciones cotidianas por sobre nombres técnicos de módulos:

- Nueva venta.
- Venta fiada.
- Recibir un abono.
- Anotar un fiado.
- Preparar pedidos.
- Cambiar precios.
- Hablar con el copiloto.
- Probar el lector.

Incluye navegación inferior móvil, búsqueda de tareas, enlaces directos a formularios, instrucciones contextuales, recorrido de primera vez y un modo fácil persistente con controles mayores.

La política de permisos permite cámara y micrófono únicamente desde el propio dominio. La geolocalización permanece deshabilitada.

## Ejecutar

No hay build de frontend. Para servir localmente:

```bash
python -m http.server 8000
```

Abrir `http://localhost:8000`.

## Pruebas

```bash
npm test
```

Las pruebas cubren:

- Conversión de unidades.
- Cálculo estimado y final.
- Tolerancias de pesaje.
- Checksum EAN-13, EAN-8 y UPC-A.
- Clasificación básica de secuencias rápidas del escáner.
- Cálculo de ventas por líneas.
- Saldos de fiado y abonos.
- Resumen de deuda bruta.
- Extracción simple desde transcripciones de cuadernos.
- Interpretación de instrucciones por voz.
- Presencia de imágenes, textos alternativos y etiquetas comerciales en el catálogo demo.
- Integridad de las tareas operacionales y sus destinos.
- Montaje global de navegación guiada y permisos de voz.

## Presentación visual

El piloto usa fotografías optimizadas desde proveedores autorizados para representar:

- Productos por peso y unidad.
- Cajas y packs familiares.
- Preparación y reparto.
- Operación en una feria o verdulería.
- Asistencia por voz y cobranza digital.

Los dominios de imágenes están restringidos mediante Content Security Policy. La atribución, política del piloto y estrategia de migración a almacenamiento propio están documentadas en `docs/IMAGE_CREDITS.md`.

## Fiados y registro diario

El módulo demostrativo permite:

- Crear cuentas de clientes.
- Registrar nuevos fiados y abonos.
- Visualizar el total bruto por cobrar.
- Ordenar clientes por saldo.
- Registrar ventas o compras con múltiples productos, cantidades y precios.
- Convertir una venta marcada como fiada en un cargo de la cuenta seleccionada.
- Previsualizar una foto del cuaderno y analizar una transcripción revisable.
- Preparar operaciones mediante comandos de voz y confirmación humana.

La extracción visual real mediante OCR/IA todavía no está conectada. La foto permanece local en el navegador y ninguna línea se importa sin confirmación humana.

## Despliegue Netlify

- Rama productiva: `main`.
- Directorio de publicación: `.`
- Comando de build: `npm test`
- Archivo de configuración: `netlify.toml`

## Advertencias del piloto

- No ingresar datos sensibles ni información real de clientes.
- Los enlaces y modos visuales no equivalen a autenticación.
- `localStorage` no es una base de datos productiva ni sincroniza dispositivos.
- El soporte físico del lector debe validarse con el dispositivo real.
- Los cálculos del piloto son demostrativos; el backend productivo usará `Decimal`, transacciones, auditoría e idempotencia.
- El módulo de fiados no ejecuta cobranza automática, no calcula intereses y no sustituye contabilidad formal.
- Las fotografías remotas son activos del piloto y deben migrarse a infraestructura controlada antes de producción.

## Referencia de reutilización

Repositorio revisado: `Crohnoz/Crohnoz-Sushi`  
Commit de referencia: `1a4e1df6591eb9d5b00cc333bdc83a63222bceb1`
