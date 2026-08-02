# Iteración 2026-08-02 — finalización del piloto comercial

## Objetivo

Completar en una sola integración los cinco bloques restantes del piloto de Crohnoz Fresh Market: inventario perecible, compras y precios, venta completa, preparación para IA real y hardening.

## Entregas

- Inventario FEFO por lotes con riesgo, condición, maduración y valor estimado.
- Compras a proveedores que crean lotes y sugieren precios protegidos por margen y merma.
- Flujo de pedidos con diferencias de peso, pagos, fiado, entrega y comprobante interno.
- Centro asistido con contexto, confianza, evidencia y cola de aprobación humana.
- PWA demostrativa, fallback offline, accesibilidad progresiva y protocolo de validación.

## Safe Practices

- Rama dedicada y PR de integración.
- Lógica crítica separada en módulos de dominio puros.
- Pruebas automatizadas por bloque.
- Validación sintáctica de aplicaciones nuevas.
- Sin secretos ni servicios externos en frontend.
- Ninguna sugerencia de precio o propuesta asistida se aplica sin acción explícita.
- Límites del piloto documentados de forma visible.

## Decisión arquitectónica

La iteración continúa como frontend estático para validar el producto y la usabilidad. La implementación productiva migrará entidades y reglas a Crohnoz Kernel/Django, con PostgreSQL, RBAC, auditoría, transacciones e idempotencia.
