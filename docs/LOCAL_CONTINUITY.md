# Continuidad local del piloto

## Propósito

Crohnoz Fresh Market 0.3.0-pilot guarda su estado en `localStorage`. El centro de continuidad reduce el riesgo de pérdida accidental durante validaciones físicas, demostraciones y pruebas de flujo.

No reemplaza una estrategia de respaldo de producción.

## Alcance del respaldo

El archivo incluye todas las colecciones del namespace `crohnoz-fresh-market`, entre ellas:

- configuración del negocio;
- pedidos y pesos reales;
- precios;
- inventario por lotes;
- proveedores y compras;
- pagos de pedidos;
- clientes, cargos, abonos y transacciones;
- cierres diarios y mermas;
- progreso del onboarding y navegación local.

## Formato

- JSON UTF-8;
- `format`: `crohnoz-fresh-market-backup`;
- `version`: `1`;
- namespace obligatorio;
- fecha ISO de exportación;
- versión del piloto;
- máximo 2 MB;
- máximo 100 colecciones;
- nombres de colección restringidos;
- claves `__proto__`, `prototype` y `constructor` bloqueadas.

## Exportar

1. Abrir `/configurador.html#continuidad`.
2. Revisar el indicador de salud local.
3. Presionar **Descargar respaldo**.
4. Confirmar que el navegador descargó un archivo `.json`.
5. Guardar la copia fuera de la carpeta temporal de descargas cuando la validación sea importante.

El nombre usa el negocio y la fecha, por ejemplo:

`mercado-la-cosecha-respaldo-2026-08-02.json`

## Restaurar

1. Seleccionar el archivo JSON.
2. Esperar la validación.
3. Revisar nombre, colecciones, registros estimados y fecha de exportación.
4. Presionar **Revisar y restaurar**.
5. Confirmar el reemplazo de los datos actuales.
6. Revisar configuración, inventario, cuentas y último cierre antes de continuar.

## Restablecer demo

La acción destructiva elimina todo el namespace local y vuelve a cargar datos ficticios base. Debe usarse únicamente para:

- comenzar una demostración limpia;
- repetir escenarios de validación;
- recuperar un navegador con datos demo inconsistentes.

Antes de restablecer, descargar una copia cuando exista información de prueba que deba conservarse.

## Recomendación automática

El inicio operacional recomienda crear respaldo cuando:

- existen al menos cinco operaciones locales nuevas; y
- nunca se descargó un respaldo, o el último tiene siete días o más.

La recomendación nunca desplaza alertas más urgentes de pedidos, pesaje, entrega, inventario crítico o cierre diario.

## Límites y seguridad

- El archivo no está cifrado.
- No se deben ingresar datos personales reales durante el piloto.
- No existe respaldo automático, nube ni sincronización multiusuario.
- La restauración no es transaccional entre dispositivos.
- El tamaño máximo busca limitar importaciones accidentales o abusivas, no constituye una defensa completa.
- En producción, esta capacidad debe migrar a PostgreSQL, almacenamiento cifrado, backups programados, retención, pruebas de restauración, auditoría y control de acceso.

## Validación mínima antes de una demostración

- exportar una copia;
- abrir el JSON y confirmar formato/version sin modificarlo;
- registrar una operación de prueba;
- restaurar la copia;
- verificar que la operación de prueba desapareció y que los datos previos regresaron;
- comprobar funcionamiento sin conexión después de haber visitado Configuración una vez.
