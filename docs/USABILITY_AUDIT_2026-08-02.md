# Auditoría de usabilidad y coherencia operacional

Fecha: 2 de agosto de 2026  
Alcance: piloto comercial estático de Crohnoz Fresh Market  
Criterio: priorizar comprensión, prevención de errores, consistencia de datos y legibilidad antes que decoración.

## Resultado ejecutivo

La auditoría identificó problemas visuales, de interacción y de coherencia entre módulos. Los hallazgos de mayor impacto fueron:

1. Las tarjetas de inventario comprimían el contenido dentro de una columna demasiado angosta y reservaban demasiado espacio a las fotografías.
2. La merma se expresaba siempre en kilogramos, incluso para productos vendidos por unidad, malla, pack o caja.
3. La merma registrada desde Operación no descontaba los lotes de inventario.
4. Los pedidos con retiro podían quedar detenidos en estado `ready` sin una transición final.
5. Una referencia de crédito podía duplicarse en el cierre si el origen no utilizaba exactamente el literal esperado.
6. Las capacidades opcionales del navegador, como voz, se trataban como bloqueadores del piloto.
7. Las propuestas del asistente mostraban datos en formato JSON y los abonos podían aprobarse sin clasificar el medio de pago.
8. La navegación móvil no representaba los módulos actuales del producto.
9. El caché offline no incluía todos los módulos necesarios y podía conservar versiones antiguas sin explicación.
10. La tienda no buscaba correctamente términos con o sin tilde y permitía preparar un pedido sin identificar al cliente.

## Correcciones aplicadas

### Inventario

- Un lote por fila en escritorio para conservar ancho legible.
- Fotografías limitadas a 132 × 132 px en escritorio y 110 × 110 px en teléfono intermedio.
- Imagen panorámica únicamente en teléfonos muy angostos.
- Nombre, riesgo, saldo y metadatos con contenedores flexibles y sin desbordes.
- Fechas presentadas en formato humano.
- Estados vacíos para búsqueda sin resultados y ausencia de stock.
- Ayuda contextual con la unidad correcta del producto.
- Límite máximo de salida equivalente al saldo disponible del lote.
- Formulario deshabilitado cuando no existen lotes activos.
- Validación de fecha de consumo preferente.

### Merma e inventario

- La unidad real se conserva: kg, unidad, malla, pack o caja.
- El registro descuenta primero el lote recomendado por FEFO/riesgo.
- Si la cantidad supera el saldo disponible, la operación se rechaza.
- Se conserva el costo estimado y la referencia de los lotes afectados.
- Los productos sin lote activo no pueden generar una merma desconectada del inventario.
- El dashboard y el cierre muestran cantidades por unidad, sin sumar dimensiones incompatibles.

### Ventas y pedidos

- Los pedidos con retiro pueden marcarse como retirados desde el estado listo.
- El filtro de estados actualiza también el detalle seleccionado.
- Estados vacíos para pedidos y pagos.
- Mensajes de confirmación y error más explícitos.
- Fecha local para movimientos de crédito.
- Validación del monto antes de registrar un pago.
- Referencias entre pago, transacción y cuenta por cobrar.

### Cierre diario

- Detección genérica de cargos vinculados a una transacción para evitar doble contabilización.
- Resumen de merma por unidades reales.
- Informe hablado y visual con montos y cantidades legibles.
- Fechas del historial en formato humano.
- Mensajes de guardado, advertencia y error diferenciados.

### Compras y precios

- No se puede guardar una compra hasta que cantidad, costo y fechas sean válidos.
- La cantidad muestra explícitamente su unidad.
- La sugerencia de precio se habilita solo cuando implica un cambio real.
- El operador sigue decidiendo si aplica el precio sugerido.
- Estados vacíos e historial más legible.

### Asistente operacional

- Las propuestas dejan de mostrar JSON al operador.
- Nombre, monto y propósito se presentan en lenguaje natural.
- Un abono exige elegir efectivo o transferencia antes de aprobarse.
- Las respuestas informativas pueden marcarse como revisadas sin modificar saldos.
- La vista previa de fotografías valida el tipo y libera URLs temporales.
- La ausencia de líneas válidas genera una explicación en vez de una cola vacía silenciosa.

### Validación del piloto

- Se separan capacidades esenciales y opcionales.
- La ausencia de reconocimiento de voz no bloquea un piloto que conserva entrada manual.
- Una tarea completada exige un tiempo mayor a cero.
- Los resultados se construyen con DOM seguro en vez de interpolar observaciones del usuario como HTML.
- Diagnóstico con nombres comprensibles y actualización al cambiar la conectividad.

### Tienda pública

- Búsqueda insensible a tildes.
- Categorías con estado accesible `aria-pressed`.
- El nombre del cliente es obligatorio antes de preparar el pedido.
- Carrito con retorno de foco, cierre mediante Escape y control de tabulación.
- Botones de cantidad con etiquetas accesibles.
- Enlaces hacia el inicio guiado real del negocio.
- Tarjetas con alturas coherentes, textos flexibles y acciones alineadas.

### Navegación y continuidad

- Barra móvil: Inicio, Ventas, Inventario, Fiados y Cierre.
- Service worker con caché ampliado para los módulos esenciales y la tienda.
- Navegación offline compatible con alias sin extensión.
- Actualizaciones del caché informadas al usuario y aplicadas mediante aprobación explícita.
- Página offline sin JavaScript inline bloqueado por CSP.

## Verificaciones automatizadas

La suite incorpora protecciones para:

- Dimensiones y estructura de las tarjetas de inventario.
- Fallback de imágenes y límites de movimientos.
- Búsqueda con normalización de acentos.
- Identificación obligatoria del cliente.
- Revisión segura de propuestas y medio de pago.
- Capacidades esenciales versus opcionales.
- Unidades mixtas de merma.
- No duplicación de créditos vinculados.
- Transición final de pedidos con retiro.
- Sintaxis de todas las aplicaciones auditadas.
- Caché offline, actualización controlada y ausencia de scripts inline.

## Pendiente de validación física

La auditoría de código no sustituye estas pruebas:

- Android Chrome y Samsung Internet.
- Windows Chrome y Edge con zoom de 125 %, 150 % y 200 %.
- Micrófono real y denegación de permiso.
- Cámara real para fotografía de cuaderno.
- Lector USB HID.
- Operadores con baja experiencia digital.
- Red móvil lenta y pérdida de conexión durante una operación.
- Lectores de pantalla y navegación completa solo con teclado.

## Límite de fase

Las mejoras elevan la calidad del piloto, pero `localStorage` continúa siendo una persistencia demostrativa. No existe aislamiento por organización, autenticación, auditoría inmutable, sincronización entre dispositivos ni integridad transaccional de backend. Estos requisitos pertenecen a la fase productiva con Crohnoz Kernel.
