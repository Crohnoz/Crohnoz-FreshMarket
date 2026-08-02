# Iteración: puente de auditoría hacia Crohnoz Kernel

Fecha: 2026-08-02  
Versión objetivo: 0.5.0-pilot  
Rama: `feat/kernel-audit-bridge`

## Problema

El piloto podía detectar incoherencias y crear respaldos con checksum, pero no mantenía evidencia ordenada de las mutaciones ni poseía un contrato formal de migración hacia un backend multiempresa.

## Alcance

- cadena local de auditoría para colecciones comerciales;
- digests antes/después sin duplicar el contenido en cada evento;
- actor local explícitamente no verificado;
- evento único para restauraciones;
- pantalla `/auditoria` con filtros y verificación;
- paquete Kernel con checksum y allowlist de colecciones;
- OpenAPI 3.1 de referencia;
- modelo PostgreSQL multiempresa con RLS;
- matriz RBAC;
- idempotencia y control optimista;
- import jobs y auditoría append-only;
- JSON Schema del paquete;
- caché offline v7;
- pruebas de manipulación, secuencia, contratos y rutas.

## Decisiones

1. No simular login ni identidad verificada.
2. No registrar carrito, navegación o preferencias visuales.
3. No almacenar payload comercial completo dentro de los eventos.
4. No permitir exportación Kernel con una cadena dañada.
5. Mantener el paquete sin cifrado solamente para datos ficticios del piloto.
6. Tratar OpenAPI y SQL como contratos, no como servicios desplegados.
7. Exigir organización, RBAC, idempotencia y auditoría servidor en producción.

## Riesgos conocidos

- `localStorage` puede borrarse o manipularse por quien controla el navegador;
- FNV-1a no es criptográfico;
- el actor local no prueba identidad;
- la cadena no sustituye controles de base de datos;
- el paquete contiene datos completos sin cifrar;
- todavía no existe importador Django/DRF;
- todavía no existe prueba física de operación.

## Criterios de aceptación

- cada escritura comercial genera un evento encadenado;
- escrituras idénticas no generan ruido;
- alterar un evento rompe la verificación;
- reordenar eventos rompe secuencia/enlace;
- una restauración conserva la cadena importada y agrega un evento;
- el paquete Kernel valida checksum y cadena;
- el paquete excluye `cart` y estado visual;
- `/auditoria` funciona offline después de precarga;
- contratos contienen tenant, RBAC, RLS, idempotencia y auditoría inmutable;
- suite completa y deploy preview deben quedar verdes antes del squash merge.
