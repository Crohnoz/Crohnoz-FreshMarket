# Crohnoz Fresh Market

Software vertical de **Crohnoz Labs** para verdulerías, fruterías y comercios de productos frescos. Reutiliza patrones de experiencia de **Crohnoz Sushi** y reserva las capacidades compartidas para **Crohnoz Kernel**.

## Estado

**Piloto comercial v0.1 en construcción.** La interfaz es navegable y usa datos ficticios guardados en el navegador. No existe autenticación, persistencia central ni seguridad multiempresa en esta fase.

## Páginas

- `/index.html`: tienda pública.
- `/admin.html`: dashboard operacional y pesaje.
- `/configurador.html`: identidad del negocio y configuración demo.
- `/scanner-lab.html`: laboratorio de lector USB tipo teclado HID.

Netlify también expone alias:

- `/dashboard`
- `/configurar`
- `/scanner`

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

## Despliegue Netlify

- Rama productiva: `main`.
- Directorio de publicación: `.`
- Comando de build: `npm test`
- Archivo de configuración: `netlify.toml`

## Advertencias del piloto

- No ingresar datos sensibles.
- Los enlaces y modos visuales no equivalen a autenticación.
- El soporte físico del lector debe validarse con el dispositivo real.
- Los cálculos del piloto son demostrativos; el backend productivo usará `Decimal`, transacciones, auditoría e idempotencia.

## Referencia de reutilización

Repositorio revisado: `Crohnoz/Crohnoz-Sushi`  
Commit de referencia: `1a4e1df6591eb9d5b00cc333bdc83a63222bceb1`
