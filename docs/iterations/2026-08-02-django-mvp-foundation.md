# Iteración · Fundación Django para MVP real

## Objetivo

Crear el primer backend ejecutable para validar Crohnoz Fresh Market con dos usuarios reales, sin reemplazar ni degradar la interfaz actual.

## Decisión

Se adopta Django 5.2 LTS, Django REST Framework y PostgreSQL. Django 6.1 no se usará en esta etapa por estar recién liberado o en transición de ecosistema. Se privilegia soporte prolongado, compatibilidad y operación simple.

## Alcance

- organizaciones y membresías;
- RBAC mínimo;
- productos;
- lotes perecibles;
- pedidos e ítems;
- API v1;
- tokens de MVP;
- scope por organización;
- auditoría servidor HMAC encadenada;
- control optimista;
- Docker Compose;
- pruebas automáticas;
- documentación de arranque.

## Fuera de alcance

- integración completa del frontend;
- importación automática de localStorage;
- despliegue productivo de la API;
- recuperación de contraseñas;
- correo transaccional;
- backups automáticos;
- pagos y documentos tributarios;
- JWT rotatorio u OIDC;
- observabilidad completa.

## Riesgos controlados

- La autenticación por token es temporal y solo para un piloto cerrado.
- Las cuentas deben usar credenciales individuales; no se permite usuario compartido.
- CORS usa allowlist explícita.
- La auditoría es inmutable desde el ORM y encadenada con HMAC-SHA256.
- Las operaciones se aíslan por membresía y organización.
- La UI seguirá siendo la superficie principal; Django Admin será herramienta de preparación y soporte.

## Siguiente iteración

Crear un adaptador de datos en el frontend que pueda trabajar en modo local o API, comenzando por autenticación, catálogo y pedidos. El cambio debe conservar la UX existente y permitir rollback al piloto local durante las pruebas.
