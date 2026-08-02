# Crohnoz Fresh Market

Software vertical de **Crohnoz Labs** para verdulerías, fruterías y comercios de productos frescos. Reutiliza patrones de experiencia de **Crohnoz Sushi** y reserva capacidades transversales para **Crohnoz Kernel**.

## Estado

**Piloto comercial funcionalmente completo, pendiente de validación física y backend real.** La interfaz usa datos ficticios y `localStorage`. No existe autenticación, persistencia central, aislamiento multiempresa ni garantía transaccional.

Versión actual: **0.5.0-pilot**.

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
- `/validacion.html`: diagnóstico técnico y pruebas de usuario.
- `/configurador.html`: identidad, respaldo, restauración y restablecimiento demo.
- `/scanner-lab.html`: laboratorio HID para lector de códigos.

Alias Netlify: `/operar`, `/inventario`, `/compras`, `/ventas`, `/asistente`, `/integridad`, `/auditoria`, `/validacion`, `/cierre`, `/dashboard`, `/cuentas`, `/configurar` y `/scanner`.

## Capacidades principales

### Inicio operacional guiado

- recomendación contextual según pedidos, pesaje, integridad, entrega, inventario y cierre;
- bloqueo prioritario ante errores críticos de coherencia;
- recomendación de respaldo después de actividad local relevante;
- tareas frecuentes separadas de herramientas secundarias;
- filtros por área;
- checklist de identidad, inventario, operación, integridad y respaldo;
- regreso seguro a la última pantalla operacional visitada;
- navegación móvil enfocada en acciones cotidianas.

### Auditoría local y puente Kernel

Las escrituras comerciales pasan por una capa transversal de auditoría. Se registran configuración, pedidos, precios, inventario, proveedores, compras, pagos, fiados, operaciones, mermas, cierres, propuestas y validaciones.

Cada evento contiene:

- secuencia incremental;
- fecha ISO;
- organización local declarada;
- actor y rol declarados;
- colección afectada;
- conteo antes y después;
- digest del estado anterior y posterior;
- hash del evento anterior;
- hash propio.

No se copia el contenido comercial completo dentro del evento. Carrito, navegación y preferencias visuales quedan fuera para reducir ruido.

La pantalla de auditoría permite:

- verificar secuencia, enlaces y hashes;
- filtrar por colección y acción;
- buscar eventos;
- revisar el nivel de confianza;
- descargar un paquete `crohnoz-kernel-import-package` versión 1;
- bloquear la exportación cuando la cadena está dañada.

El actor actual siempre aparece como **local no verificado**. Esta capa detecta manipulación accidental del historial, pero no autentica personas, no entrega no repudio y no sustituye auditoría servidor.

### Contratos de producción

El repositorio incluye contratos versionados, todavía no desplegados:

- `docs/contracts/fresh-market.openapi.yaml`: API multiempresa, JWT, RBAC, idempotencia y control optimista.
- `docs/contracts/postgresql-schema.sql`: organizaciones, membresías, datos operacionales, RLS, constraints, import jobs y auditoría append-only.
- `docs/contracts/kernel-import-package.schema.json`: envoltura JSON del paquete de migración.
- `docs/KERNEL_MIGRATION_BRIDGE.md`: flujo de importación, matriz RBAC, fases y criterios de salida.

El SQL es una especificación de diseño. Debe convertirse en migraciones Django revisadas antes de ejecutarse.

### Integridad de datos

- diagnóstico local y de solo lectura;
- estado efectivo materializado antes de auditar o respaldar;
- IDs ausentes o duplicados;
- referencias rotas entre pedidos, pagos, clientes, compras, proveedores, lotes y transacciones;
- cantidades, costos, precios, totales y saldos inválidos;
- stock negativo;
- fechas defectuosas o incoherentes;
- conciliación matemática del cierre diario;
- clasificación en saludable, revisión recomendada o bloqueo crítico;
- filtros, búsqueda e informe descargable;
- reglas preparadas para constraints PostgreSQL y validadores Django/DRF.

### Inventario perecible

- lotes por recepción;
- costo, condición y maduración;
- fecha de consumo preferente;
- saldo por lote;
- venta, merma y ajuste;
- prioridad FEFO y valor en riesgo.

### Compras, ventas y cuentas

- proveedores demo, costos e historial de compras;
- creación de lotes y sugerencias de precio por margen/merma;
- cantidades solicitadas y reales;
- confirmación de diferencias;
- pagos en efectivo, transferencia o fiado;
- comprobante interno no tributario;
- clientes, cargos, abonos y saldos.

### Asistencia preparada para IA

- contexto de inventario, deuda, compras y cierres;
- respuesta con confianza y evidencia;
- propuestas pendientes hasta revisión humana;
- aprobación o rechazo explícito;
- importación desde transcripción revisada;
- JSON Schema para backend futuro.

### Continuidad local

- instantánea efectiva autosuficiente;
- respaldo JSON versión 2 limitado a 2 MB;
- checksum para detectar alteraciones accidentales;
- compatibilidad con respaldos versión 1;
- validación de producto, versión, namespace, fecha y colecciones;
- análisis semántico antes de restaurar;
- restauración bloqueada ante errores críticos;
- confirmación explícita antes de reemplazar datos;
- evento único `snapshot.restore` después de recuperar una copia;
- caché offline de operación, integridad, auditoría y continuidad.

## Ejecutar

```bash
python -m http.server 8000
```

Abrir `http://localhost:8000/operar.html`.

## Pruebas

```bash
npm test
```

La suite cubre mediciones, pesaje, códigos, fiados, voz, imágenes, cierre, inventario, compras, márgenes, pedidos, propuestas, rutas, UX reversible, respaldo, checksum, compatibilidad anterior, corrupción semántica, auditoría encadenada, paquete Kernel, contratos, onboarding y caché offline.

## Seguridad y límites

- No ingresar datos reales, personales, clínicos, financieros o sensibles.
- `localStorage` no sincroniza dispositivos y puede perderse.
- Los respaldos y paquetes Kernel son manuales, no cifrados y contienen datos completos.
- FNV-1a detecta alteraciones accidentales; no es firma digital, HMAC ni autenticación.
- El actor local no está autenticado.
- El auditor comprueba coherencia interna, no veracidad comercial.
- Restablecer el piloto elimina también su historial local.
- El service worker mejora continuidad, pero no constituye respaldo.
- Voz, cámara y escáner dependen del navegador y hardware.
- Las fotografías externas deben migrarse a infraestructura controlada.
- Los precios son sugerencias, no decisiones automáticas.
- El comprobante interno no es documento tributario.
- El cierre no reemplaza contabilidad formal ni conciliación bancaria.

## Producción futura

Django, DRF, PostgreSQL, JWT, organizaciones, membresías, RBAC servidor, auditoría transaccional, idempotencia, control optimista, constraints, almacenamiento privado, import jobs, backups automáticos cifrados, restauraciones probadas, observabilidad, privacidad, pagos e integración tributaria.

## Referencia de reutilización

Repositorio revisado: `Crohnoz/Crohnoz-Sushi`  
Commit de referencia: `1a4e1df6591eb9d5b00cc333bdc83a63222bceb1`
