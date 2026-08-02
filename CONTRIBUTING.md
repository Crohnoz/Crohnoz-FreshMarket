# Contribuir

## Flujo de trabajo

1. Crear o seleccionar un issue.
2. Crear una rama desde `main`.
3. Realizar cambios pequeños y comprobables.
4. Ejecutar `npm test`.
5. Abrir un pull request con alcance, pruebas, riesgos y capturas cuando corresponda.
6. Hacer squash merge después de revisión.

## Convención de commits

- `feat:` funcionalidad nueva.
- `fix:` corrección.
- `docs:` documentación.
- `test:` pruebas.
- `refactor:` cambio interno sin alterar comportamiento.
- `chore:` mantenimiento.

## Restricciones del piloto

- No presentar `localStorage` como base de datos productiva.
- No representar el cambio visual de roles como autorización real.
- No agregar datos personales reales al dataset.
- No duplicar lógica de cálculo entre vistas.
