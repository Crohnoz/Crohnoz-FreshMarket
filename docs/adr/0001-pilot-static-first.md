# ADR 0001 — Piloto estático primero

## Estado

Aceptado.

## Contexto

Se necesita validar el flujo comercial y el lector USB antes de comprometer el modelo productivo completo.

## Decisión

El piloto v0.1 será una aplicación estática modular desplegada en Netlify. Usará datos ficticios y almacenamiento local, con advertencias visibles.

## Consecuencias

- Permite iterar rápidamente y probar UX.
- No ofrece autenticación ni colaboración multiusuario.
- El backend Django se implementará después de validar los flujos críticos.
