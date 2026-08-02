# Puente de migración hacia Crohnoz Kernel

## Estado

Este documento describe la transición desde **Crohnoz Fresh Market 0.5.0-pilot** hacia un servicio real basado en Crohnoz Kernel.

La versión actual continúa funcionando con datos ficticios y `localStorage`. Los contratos incluidos en este repositorio no significan que exista un backend desplegado, autenticación, aislamiento multiempresa ni cumplimiento transaccional.

## Objetivos del puente

1. Registrar cambios comerciales relevantes en una secuencia verificable.
2. Mantener separado el historial de auditoría del contenido comercial completo.
3. Exportar un paquete de importación versionado y con checksum.
4. Fijar anticipadamente el contrato HTTP y el modelo PostgreSQL.
5. Evitar que la migración futura dependa de decisiones improvisadas.

## Implementado en el piloto

### Auditoría local encadenada

Las mutaciones de estas colecciones generan eventos:

- configuración comercial;
- pedidos;
- precios;
- inventario por lotes;
- proveedores y compras;
- pagos de pedidos;
- clientes y movimientos de fiado;
- operaciones diarias;
- mermas;
- cierres diarios;
- propuestas asistidas;
- validaciones del piloto.

No se registran carrito, navegación, modo fácil ni otras preferencias de interfaz.

Cada evento contiene:

- secuencia incremental;
- fecha ISO;
- organización local declarada;
- actor y rol declarados;
- colección afectada;
- cantidad de registros antes y después;
- digest del estado anterior y posterior;
- hash del evento anterior;
- hash propio.

El evento no duplica el contenido completo de la colección.

### Límite de identidad

El actor del navegador se marca como:

- `type: local-operator`;
- `role: owner`;
- `verified: false`.

Esto permite probar el formato sin afirmar que la identidad fue autenticada. Una cadena correcta demuestra coherencia local, no autoría legal, no repudio ni identidad humana.

### Restauraciones

Una restauración validada:

1. reemplaza el snapshot local;
2. conserva la cadena importada si existe;
3. agrega un evento `snapshot.restore`;
4. registra únicamente el resumen anterior y posterior.

### Paquete Kernel

La pantalla `/auditoria` puede descargar un archivo:

- formato `crohnoz-kernel-import-package`;
- versión `1`;
- origen, versión del piloto y nivel de confianza;
- organización local;
- colecciones comerciales permitidas;
- historial de auditoría;
- resultado de verificación de la cadena;
- checksum del payload.

El archivo no está cifrado y contiene los datos comerciales completos del piloto.

## Contratos versionados

### API

`docs/contracts/fresh-market.openapi.yaml`

Principios obligatorios:

- JWT para identidad;
- organización explícita en toda ruta de negocio;
- membresía activa antes de autorizar;
- RBAC;
- `Idempotency-Key` en mutaciones;
- `If-Match` o versión optimista en actualizaciones concurrentes;
- errores que no revelen recursos de otras organizaciones;
- cierres diarios tratados como snapshots versionados;
- auditoría de solo lectura mediante API.

### PostgreSQL

`docs/contracts/postgresql-schema.sql`

Incluye:

- organizaciones;
- usuarios y membresías;
- productos, clientes y proveedores;
- pedidos y líneas;
- pagos;
- compras y líneas;
- inventario por lotes;
- cuentas por cobrar;
- operaciones diarias;
- mermas;
- cierres versionados;
- idempotencia;
- eventos de auditoría append-only;
- trabajos de importación;
- foreign keys, checks e índices;
- Row Level Security por organización.

El SQL es un contrato de diseño. Debe convertirse en migraciones Django revisadas; no debe ejecutarse directamente en producción sin validación.

### JSON Schema

`docs/contracts/kernel-import-package.schema.json`

Valida la envoltura y estructura mínima del paquete. La importación real debe ejecutar además:

- checksum;
- cadena de auditoría;
- tipos por colección;
- unicidad de IDs fuente;
- referencias cruzadas;
- montos y cantidades;
- fechas;
- límites de tamaño y número de registros;
- permisos del usuario solicitante.

## Matriz RBAC inicial

| Capacidad | Owner | Manager | Operator | Viewer |
|---|---:|---:|---:|---:|
| Configurar organización | Sí | Parcial | No | No |
| Administrar membresías | Sí | No | No | No |
| Ver operación | Sí | Sí | Sí | Sí |
| Crear ventas y pedidos | Sí | Sí | Sí | No |
| Modificar inventario | Sí | Sí | Sí | No |
| Registrar compras | Sí | Sí | Sí | No |
| Registrar fiados/abonos | Sí | Sí | Sí | No |
| Crear cierre diario | Sí | Sí | Sí | No |
| Reabrir o superseder cierre | Sí | Sí | No | No |
| Exportar datos | Sí | Sí | No | No |
| Importar paquete | Sí | No | No | No |
| Ver auditoría | Sí | Sí | Parcial | Parcial |

La autorización debe implementarse servidor-side. Ocultar botones no constituye RBAC.

## Flujo de importación seguro

1. Cargar el archivo en almacenamiento privado temporal.
2. Validar tamaño, MIME y JSON.
3. Validar JSON Schema.
4. Verificar checksum del paquete.
5. Verificar cadena de auditoría.
6. Ejecutar auditoría semántica de todas las colecciones.
7. Crear un `import_job` sin modificar datos productivos.
8. Mostrar errores y advertencias al owner.
9. Crear la organización destino o seleccionar una vacía.
10. Importar dentro de una transacción PostgreSQL.
11. Mantener tabla de mapeo `source_id -> target_id`.
12. Confirmar conteos y saldos.
13. Registrar el evento de importación en auditoría servidor.
14. Ejecutar pruebas posteriores y conservar rollback lógico.

No se debe importar parcialmente una colección crítica sin una política explícita.

## Idempotencia

Toda mutación HTTP requiere una clave estable por intento lógico. El servidor debe conservar:

- organización;
- actor;
- método y ruta;
- hash del request;
- estado y body de la respuesta;
- expiración.

Reutilizar la misma clave con otro payload debe responder conflicto.

## Auditoría de producción

La auditoría servidor debe ser:

- append-only;
- ordenada por organización;
- generada dentro de la misma transacción que la mutación;
- asociada a identidad autenticada y membresía efectiva;
- protegida contra `UPDATE` y `DELETE`;
- exportable únicamente por permisos explícitos;
- observable y respaldada.

La cadena FNV-1a del piloto sirve para detectar cambios accidentales. Producción debe evaluar HMAC o firmas con claves administradas, además de controles de base de datos y almacenamiento inmutable.

## Fases recomendadas

### Fase 1: Backend base

- proyecto Django/DRF;
- PostgreSQL;
- organizaciones y membresías;
- autenticación;
- middleware de tenant;
- RBAC;
- auditoría servidor;
- idempotencia;
- health checks y observabilidad.

### Fase 2: Importación

- endpoint de import jobs;
- validación del paquete versión 1;
- preview sin escritura;
- mapeo de IDs;
- importación transaccional;
- informe y pruebas de restauración.

### Fase 3: Sincronización del frontend

- repositorio de datos intercambiable;
- lectura API;
- mutaciones idempotentes;
- manejo offline con cola explícita;
- resolución de conflictos;
- eliminación progresiva de `localStorage` comercial.

### Fase 4: Producción

- backups automáticos cifrados;
- retención;
- restauraciones probadas;
- secretos administrados;
- monitoreo y alertas;
- privacidad y minimización de datos;
- integración de pagos y tributación por módulos separados.

## Criterio de salida del piloto local

No declarar producción hasta demostrar:

- aislamiento entre al menos dos organizaciones;
- pruebas negativas de permisos;
- idempotencia bajo reintentos;
- concurrencia y versionado;
- migración completa de un paquete;
- rollback probado;
- auditoría inmutable;
- respaldo y restauración;
- observabilidad;
- validación física de operación diaria.
