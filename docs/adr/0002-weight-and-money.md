# ADR 0002 — Cantidades y dinero

## Estado

Aceptado para piloto; requiere implementación con `Decimal` en backend.

## Decisión

- Las cantidades se normalizan a una unidad base.
- Los montos se redondean a pesos chilenos enteros.
- Cada línea conserva el precio usado en el cálculo.
- Se distinguen total estimado y total final.
- Una diferencia requiere confirmación si supera la tolerancia o el monto adicional autorizado.
