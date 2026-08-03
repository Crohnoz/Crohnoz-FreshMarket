# Crohnoz Fresh Market

Software vertical de **Crohnoz Labs** para verdulerías, fruterías y comercios de productos frescos. Reutiliza patrones de experiencia de **Crohnoz Sushi** y reserva capacidades transversales para **Crohnoz Kernel**.

## Estado

**Piloto comercial con backend Django desplegable y operaciones remotas separadas.** La interfaz mantiene un modo local completo con datos ficticios. Django incorpora autenticación temporal, organizaciones, RBAC, catálogo, recepción de lotes, pedidos, preparación, idempotencia, control de versión y auditoría servidor. El Blueprint de hosting está preparado, pero la instancia pública todavía debe crearse y verificarse.

Versión actual: **0.8.0-pilot**.  
Avance estimado del MVP real para Camila y Carmelo: **79%**.

## Páginas

- `/index.html`: tienda pública local.
- `/operar.html`: inicio guiado, prioridades, checklist y continuación de tareas.
- `/admin.html`: preparación, pesaje, precios rápidos y merma local.
- `/cuentas.html`: fiados, abonos, operaciones rápidas y voz local.
- `/cierre.html`: conciliación diaria de efectivo local.
- `/inventario.html`: inventario perecible por lotes y prioridad FEFO local.
- `/inventario-remoto.html`: recepción y consulta de lotes en Django.
- `/compras.html`: proveedores, costos, recepción y precio sugerido local.
- `/ventas.html`: confirmación, cobro, entrega y comprobante interno local.
- `/pedidos-remotos.html`: catálogo, creación, preparación, cantidades reales y estado listo en Django.
- `/asistente.html`: contexto operacional y propuestas revisables.
- `/integridad.html`: diagnóstico de IDs, referencias, montos, saldos y fechas.
- `/auditoria.html`: cadena local de cambios y exportación para Crohnoz Kernel.
- `/conexion.html`: configuración API, login, organización y resumen del backend.
- `/validacion.html`: diagnóstico técnico y pruebas de usuario.
- `/configurador.html`: identidad, respaldo, restauración y restablecimiento demo.
- `/scanner-lab.html`: laboratorio HID para lector de códigos.

Alias Netlify: `/operar`, `/inventario`, `/inventario-remoto`, `/compras`, `/ventas`, `/pedidos-remotos`, `/asistente`, `/integridad`, `/auditoria`, `/conexion`, `/validacion`, `/cierre`, `/dashboard`, `/cuentas`, `/configurar` y `/scanner`.

## Capacidades principales

### Inicio operacional guiado

- recomendación contextual según pedidos, pesaje, integridad, entrega, inventario y cierre;
- bloqueo prioritario ante errores críticos de coherencia;
- recomendación de respaldo después de actividad local relevante;
- tareas frecuentes separadas de herramientas secundarias;
- búsqueda y filtros por área;
- checklist de identidad, inventario, operación, integridad, conexión y respaldo;
- destinos remotos cuando existe una sesión conectada;
- regreso seguro a la última pantalla visitada;
- navegación móvil enfocada en acciones cotidianas;
- franja global que distingue modo local, API configurada y sesión conectada.

### Puente frontend–Django

La pantalla `/conexion` permite:

- configurar una URL API HTTPS;
- comprobar el endpoint de salud;
- iniciar sesión con una cuenta individual;
- elegir organización cuando existen varias membresías;
- visualizar usuario, negocio y rol;
- consultar conteos y catálogo preliminar del servidor;
- cerrar sesión;
- volver explícitamente al modo local.

La URL y el modo se guardan en `localStorage`. El token, la identidad y la organización activa se guardan únicamente en `sessionStorage`, quedan fuera de los respaldos y vencen en el servidor.

### Inventario remoto

La pantalla `/inventario-remoto`:

- consulta catálogo y lotes de la organización autenticada;
- registra producto, fechas, cantidad, costo, calidad y observaciones;
- crea lotes activos con disponibilidad inicial igual a la recepción;
- conserva la clave de reintento si la red falla;
- devuelve el mismo lote ante un replay idéntico;
- muestra riesgo por calidad y fecha preferente;
- nunca escribe una recepción en el almacenamiento local;
- no permite editar o eliminar lotes directamente.

Los ajustes, mermas y devoluciones deberán implementarse como movimientos trazables en un incremento posterior.

### Pedidos y preparación remotos

La pantalla `/pedidos-remotos` trabaja solo con una sesión conectada:

- consulta productos activos de la organización autenticada;
- pagina colecciones remotas con límite defensivo;
- busca por nombre, SKU o categoría;
- crea pedidos con cantidades y precios del catálogo servidor;
- fuerza estado, medio de pago y origen seguros en el backend;
- evita productos duplicados y cantidades reales prellenadas;
- lista pedidos recientes y sus líneas;
- inicia preparación mediante una transición explícita;
- registra exactamente todas las cantidades reales;
- recalcula líneas y total en Django;
- marca listo solo cuando todas las líneas están completas;
- usa `If-Match` para detectar versiones obsoletas;
- conserva claves de reintento por pedido y acción;
- nunca cambia silenciosamente a datos locales.

Las pantallas históricas continúan locales hasta que cada dominio tenga endpoints, pruebas, rollback y manejo offline definidos.

### Backend Django

El directorio `backend/` contiene:

- Django 5.2 LTS;
- Django REST Framework;
- PostgreSQL para despliegue;
- `DATABASE_URL` para hosting administrado;
- WhiteNoise para los estáticos del admin;
- organizaciones y membresías;
- roles `owner`, `manager`, `operator` y `viewer`;
- productos y filtro de activos;
- recepción idempotente de lotes;
- pedidos e ítems con unidad de venta;
- transiciones `confirmed → preparing → ready`;
- pesaje completo y recálculo servidor;
- idempotencia por organización y entidad;
- control optimista obligatorio en transiciones;
- auditoría append-only con HMAC-SHA256;
- tokens temporales con vencimiento;
- Docker y Docker Compose;
- comando `seed_pilot` para Camila y Carmelo;
- Blueprint `render.yaml` con servicio y base aislados.

### Auditoría local y puente Kernel

Las escrituras comerciales locales pasan por una capa transversal de auditoría. Cada evento incluye secuencia, fecha, organización declarada, actor local, colección, digests y hash anterior/propio.

La pantalla de auditoría permite verificar la cadena, filtrar eventos y descargar un paquete `crohnoz-kernel-import-package` versión 1. El actor local sigue siendo **no verificado**; la identidad autenticada real corresponde al backend Django.

### Integridad de datos

- diagnóstico local de solo lectura;
- estado efectivo materializado antes de auditar o respaldar;
- IDs ausentes o duplicados;
- referencias rotas;
- cantidades, costos, precios, totales y saldos inválidos;
- stock negativo;
- fechas incoherentes;
- conciliación matemática del cierre;
- clasificación saludable, advertencia o bloqueo crítico;
- informe descargable.

### Inventario, compras, ventas y cuentas locales

- lotes por recepción y prioridad FEFO;
- costo, condición, maduración y fecha preferente;
- proveedores, historial de compras y precios sugeridos;
- cantidades solicitadas y reales;
- confirmación de diferencias;
- efectivo, transferencia y fiado;
- clientes, cargos, abonos y saldos;
- comprobante interno no tributario;
- cierre diario y conciliación de caja.

### Continuidad local

- respaldo JSON versión 2 con checksum;
- compatibilidad con respaldos versión 1;
- análisis semántico antes de restaurar;
- bloqueo ante errores críticos;
- confirmación antes de reemplazar datos;
- caché offline de superficies locales y shells remotos;
- rollback explícito desde modo API a modo local.

Las pantallas remotas pueden abrirse desde caché, pero sus consultas y escrituras requieren red y backend disponible. No existe una cola offline.

## Ejecutar el frontend

```bash
python -m http.server 8000
```

Abrir `http://localhost:8000/operar.html`.

## Ejecutar el backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8001
```

Después abrir `http://localhost:8000/conexion.html`, usar como base API:

```text
http://localhost:8001/api/v1
```

e ingresar a `http://localhost:8000/inventario-remoto.html` o `http://localhost:8000/pedidos-remotos.html`.

Las instrucciones completas están en `backend/README.md`, `docs/API_BRIDGE.md` y `docs/REMOTE_OPERATIONS.md`.

## Despliegue administrado preparado

`render.yaml` declara:

- un servicio web Python para Django;
- una base PostgreSQL exclusiva de Fresh Market;
- health check;
- migraciones durante el build compatible con el plan declarado;
- carga inicial del piloto;
- secretos generados;
- contraseñas piloto solicitadas de forma segura;
- CORS limitado al frontend productivo.

El Blueprint todavía no equivale a un despliegue verificado. Después de crear la instancia deben comprobarse health, login, dos sesiones, recepción, preparación, idempotencia, versiones, logs y backups antes de ingresar datos operacionales.

## Pruebas

```bash
npm test
```

```bash
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test
```

La CI ejecuta frontend y backend por separado.

## Seguridad y límites

- No ingresar datos personales, clínicos, financieros o sensibles durante esta fase.
- El backend público todavía no ha sido creado ni verificado.
- Una sesión conectada no significa que todas las pantallas estén sincronizadas.
- Solo `/inventario-remoto` y `/pedidos-remotos` operan mediante Django.
- Los flujos locales permanecen separados y no se sincronizan automáticamente.
- No existe cola offline ni resolución bidireccional de conflictos.
- No existe aún descuento FEFO remoto, cobro, fiado, entrega final ni cierre remoto.
- El token temporal no reemplaza JWT rotatorio, OIDC ni recuperación de cuenta.
- Los respaldos locales y paquetes Kernel no están cifrados.
- El CSP permite temporalmente conexiones HTTPS amplias y debe restringirse al host definitivo de la API.
- El service worker mejora continuidad local, pero no constituye respaldo del backend.
- Voz, cámara y escáner dependen del navegador y hardware.
- Los precios son sugerencias, no decisiones automáticas.
- El comprobante interno no es documento tributario.
- El cierre no reemplaza contabilidad formal ni conciliación bancaria.

## Próximos bloques

1. crear y verificar la instancia Django/PostgreSQL desde el Blueprint;
2. restringir CSP al hostname exacto resultante;
3. probar recepción y preparación con Camila y Carmelo en dos sesiones;
4. implementar movimientos de inventario y descuento FEFO remoto;
5. conectar cobro, entrega, pagos y fiados;
6. conectar cierre diario y respaldos del servidor;
7. agregar cola offline para mutaciones compatibles;
8. validar presencialmente con usuarios de baja familiaridad digital.

## Documentación relevante

- `docs/MVP_STATUS.md`
- `docs/API_BRIDGE.md`
- `docs/REMOTE_OPERATIONS.md`
- `docs/KERNEL_MIGRATION_BRIDGE.md`
- `docs/LOCAL_CONTINUITY.md`
- `docs/DATA_INTEGRITY.md`
- `backend/README.md`

## Referencia de reutilización

Repositorio revisado: `Crohnoz/Crohnoz-Sushi`  
Commit de referencia: `1a4e1df6591eb9d5b00cc333bdc83a63222bceb1`
