# Continuidad local del piloto

## Propósito

Crohnoz Fresh Market 0.4.0-pilot guarda su estado en `localStorage`. El centro de continuidad reduce el riesgo de pérdida accidental durante validaciones físicas, demostraciones y pruebas de flujo.

No reemplaza una estrategia de respaldo de producción.

## Alcance del respaldo

La exportación materializa el estado efectivo completo del piloto, incluso cuando una colección todavía usa su valor demo por defecto y no ha sido escrita físicamente en `localStorage`.

El archivo incluye, entre otras colecciones:

- configuración del negocio;
- pedidos y pesos reales;
- precios;
- inventario por lotes;
- proveedores y compras;
- pagos de pedidos;
- clientes, cargos, abonos y transacciones;
- cierres diarios y mermas;
- propuestas y validaciones locales;
- progreso del onboarding y navegación local.

## Formato actual

- JSON UTF-8;
- `format`: `crohnoz-fresh-market-backup`;
- `version`: `2`;
- namespace obligatorio;
- fecha ISO de exportación;
- versión del piloto;
- checksum FNV-1a de 64 bits sobre una representación canónica de `entries`;
- máximo 2 MB;
- máximo 100 colecciones;
- nombres de colección restringidos;
- claves `__proto__`, `prototype` y `constructor` bloqueadas.

El checksum sirve para detectar alteraciones o daños accidentales. No es una firma digital, no autentica al autor y no protege contra una modificación maliciosa que recalcule el valor.

## Compatibilidad

Los respaldos versión 1 siguen siendo aceptados para evitar pérdida de copias antiguas. Como no contienen checksum, la interfaz los muestra como **compatibles pero no verificados** y exige una decisión consciente del operador.

Las versiones distintas de 1 y 2 son rechazadas.

## Exportar

1. Abrir `/configurador.html#continuidad`.
2. Revisar el indicador de salud local.
3. Abrir `/integridad.html` cuando existan advertencias o errores.
4. Presionar **Descargar respaldo con checksum**.
5. Confirmar que el navegador descargó un archivo `.json`.
6. Guardar la copia fuera de la carpeta temporal de descargas cuando la validación sea importante.

El nombre usa el negocio y la fecha, por ejemplo:

`mercado-la-cosecha-respaldo-2026-08-02.json`

Los datos ilegibles bloquean la exportación para no producir una copia silenciosamente incompleta. Los errores semánticos permiten descargar una copia de resguardo, pero se muestran como estado crítico y deben revisarse antes de continuar operando.

## Restaurar

1. Seleccionar el archivo JSON.
2. Esperar la validación de formato, namespace, versión y tamaño.
3. Para versión 2, esperar la verificación del checksum.
4. Revisar colecciones, registros estimados y fecha de exportación.
5. Revisar el resultado del análisis semántico.
6. Presionar **Revisar y restaurar**.
7. Confirmar el reemplazo de los datos actuales.
8. Revisar configuración, inventario, cuentas y último cierre antes de continuar.

La restauración se bloquea cuando el archivo contiene errores críticos como:

- identificadores duplicados;
- referencias a pedidos, clientes, proveedores o lotes inexistentes;
- saldos negativos de inventario;
- cantidades o montos inválidos;
- conciliaciones matemáticamente inconsistentes.

Las advertencias no bloqueantes y los respaldos versión 1 se pueden restaurar después de una advertencia explícita.

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

Los errores críticos de integridad se muestran antes que pesaje, respaldo y otras tareas normales. Las advertencias de integridad no desplazan confirmaciones de clientes, pedidos urgentes, inventario crítico ni cierre diario.

## Límites y seguridad

- El archivo no está cifrado.
- No se deben ingresar datos personales reales durante el piloto.
- No existe respaldo automático, nube ni sincronización multiusuario.
- La restauración no es transaccional entre dispositivos.
- El checksum no es criptográfico ni reemplaza control de acceso o firma digital.
- El tamaño máximo busca limitar importaciones accidentales o abusivas, no constituye una defensa completa.
- En producción, esta capacidad debe migrar a PostgreSQL, almacenamiento cifrado, backups programados, retención, pruebas de restauración, auditoría y control de acceso.

## Validación mínima antes de una demostración

- ejecutar Integridad y revisar el resultado;
- exportar una copia;
- abrir el JSON y confirmar formato, versión y checksum sin modificarlo;
- registrar una operación de prueba;
- restaurar la copia;
- verificar que la operación de prueba desapareció y que los datos previos regresaron;
- modificar una copia descartable y confirmar que la restauración la rechaza por checksum;
- comprobar funcionamiento sin conexión después de haber visitado Configuración e Integridad una vez.
