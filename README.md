# Crohnoz Fresh Market

Software vertical de **Crohnoz Labs** para verdulerías, fruterías y comercios de productos frescos. Reutiliza patrones de experiencia de **Crohnoz Sushi** y reserva capacidades transversales para **Crohnoz Kernel**.

## Estado

**Piloto comercial navegable con fundación Django y puente de sesión, pendiente de despliegue backend e integración operacional.** La interfaz conserva un modo local con datos ficticios. Django ya incorpora autenticación temporal, organizaciones, RBAC, catálogo, lotes, pedidos y auditoría servidor.

Versión actual: **0.6.0-pilot**.  
Avance estimado del MVP real para Camila y Carmelo: **70%**.

## Páginas

- `/index.html`: tienda pública.
- `/operar.html`: inicio guiado, prioridades, checklist y continuación de tareas.
- `/admin.html`: preparación, pesaje, precios rápidos y merma.
- `/cuentas.html`: fiados, abonos, operaciones rápidas y voz.
- `/cierre.html`: conciliación diaria de efectivo.
- `/inventario.html`: inventario perecible por lotes y prioridad FEFO.
- `/compras.html`: proveedores, costos, recepción y precio sugerido.
- `/ventas.html`: confirmación, cobro, entrega y comprobante interno.
- `/asistente.html`: contexto operacional y propuestas revisables.
- `/integridad.html`: diagnóstico de IDs, referencias, montos, saldos y fechas.
- `/auditoria.html`: cadena local de cambios y exportación para Crohnoz Kernel.
- `/conexion.html`: configuración API, login, organización y resumen del backend.
- `/validacion.html`: diagnóstico técnico y pruebas de usuario.
- `/configurador.html`: identidad, respaldo, restauración y restablecimiento demo.
- `/scanner-lab.html`: laboratorio HID para lector de códigos.

Alias Netlify: `/operar`, `/inventario`, `/compras`, `/ventas`, `/asistente`, `/integridad`, `/auditoria`, `/conexion`, `/validacion`, `/cierre`, `/dashboard`, `/cuentas`, `/configurar` y `/scanner`.

## Capacidades principales

### Inicio operacional guiado

- recomendación contextual según pedidos, pesaje, integridad, entrega, inventario y cierre;
- bloqueo prioritario ante errores críticos de coherencia;
- recomendación de respaldo después de actividad local relevante;
- tareas frecuentes separadas de herramientas secundarias;
- búsqueda y filtros por área;
- checklist de identidad, inventario, operación, integridad y respaldo;
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

La conexión actual cubre sesión y lectura de resumen. Las operaciones comerciales cotidianas todavía permanecen locales hasta implementar sus repositorios API.

### Backend Django

El directorio `backend/` contiene:

- Django 5.2 LTS;
- Django REST Framework;
- PostgreSQL para despliegue;
- organizaciones y membresías;
- roles `owner`, `manager`, `operator` y `viewer`;
- productos;
- lotes perecibles;
- pedidos e ítems;
- idempotencia por organización;
- control optimista;
- auditoría append-only con HMAC-SHA256;
- tokens temporales con vencimiento;
- Docker y Docker Compose;
- comando `seed_pilot` para Camila y Carmelo.

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

### Inventario, compras, ventas y cuentas

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
- caché offline de superficies locales;
- rollback explícito desde modo API a modo local.

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

Después abrir `http://localhost:8000/conexion.html` y usar como base API:

```text
http://localhost:8001/api/v1
```

Las instrucciones completas están en `backend/README.md` y `docs/API_BRIDGE.md`.

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
- El backend todavía no está desplegado públicamente.
- Una sesión conectada no significa que todas las pantallas estén sincronizadas.
- Los flujos operacionales todavía escriben en `localStorage`.
- No existe sincronización bidireccional ni cola offline.
- El token temporal no reemplaza JWT rotatorio, OIDC ni recuperación de cuenta.
- Los respaldos locales y paquetes Kernel no están cifrados.
- El CSP permite temporalmente conexiones HTTPS amplias y debe restringirse al host definitivo de la API.
- El service worker mejora continuidad local, pero no constituye respaldo del backend.
- Voz, cámara y escáner dependen del navegador y hardware.
- Los precios son sugerencias, no decisiones automáticas.
- El comprobante interno no es documento tributario.
- El cierre no reemplaza contabilidad formal ni conciliación bancaria.

## Próximos bloques

1. desplegar Django y PostgreSQL bajo HTTPS;
2. restringir CORS y CSP a hosts exactos;
3. ejecutar migraciones y preparar cuentas piloto;
4. conectar lectura de catálogo;
5. conectar creación y consulta de pedidos;
6. conectar inventario, pagos, fiados y cierre;
7. probar dos sesiones simultáneas;
8. validar presencialmente con Camila y Carmelo.

## Documentación relevante

- `docs/MVP_STATUS.md`
- `docs/API_BRIDGE.md`
- `docs/KERNEL_MIGRATION_BRIDGE.md`
- `docs/LOCAL_CONTINUITY.md`
- `docs/DATA_INTEGRITY.md`
- `backend/README.md`

## Referencia de reutilización

Repositorio revisado: `Crohnoz/Crohnoz-Sushi`  
Commit de referencia: `1a4e1df6591eb9d5b00cc333bdc83a63222bceb1`
