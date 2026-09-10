# Seguridad

Crohnoz Fresh Market se encuentra en fase **L1 · Prototype / R&D**.

## Alcance actual

- Parte de la experiencia sigue operando localmente en el navegador.
- No existe todavía un modelo de autenticación productiva completo para toda la superficie operacional.
- Los cambios de modo o navegación no deben interpretarse como control de acceso real por sí solos.
- No deben ingresarse datos sensibles, credenciales ni información real de clientes en superficies de demostración.
- Los flujos backend deben aplicar validación y autorización server-side antes de considerarse aptos para producción.

## Reporte responsable

No publiques una vulnerabilidad con datos explotables en un issue público. Comunícala directamente al propietario de Crohnoz Labs y registra posteriormente una descripción saneada del incidente y su corrección cuando corresponda.

## Reglas mínimas

- No guardar secretos en el repositorio.
- No agregar tokens privilegiados en JavaScript cliente.
- Revisar dependencias antes de incorporarlas.
- Mantener operaciones críticas en el backend cuando el flujo requiera integridad, autorización o persistencia compartida.
- Separar explícitamente datos de demostración de cualquier entorno con información real.
- No promover el producto a piloto o producción sin evidencia operacional que justifique el cambio de madurez.
