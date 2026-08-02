# Estado del MVP · Crohnoz Fresh Market

Fecha de corte: 2 de agosto de 2026.

## Lectura ejecutiva

El producto tiene tres porcentajes distintos y no deben confundirse:

| Alcance | Avance estimado | Interpretación |
|---|---:|---|
| Piloto navegable y demostrable | 90% | La experiencia visual y los flujos principales existen y se pueden recorrer con datos ficticios. |
| MVP real para Camila y Carmelo | 60% | Falta conectar la interfaz al backend, desplegar la API, crear cuentas y completar la validación presencial. |
| Producto comercial endurecido | 35% | Faltan operación multiusuario madura, backups automáticos, observabilidad, privacidad, soporte y preparación tributaria. |

Los porcentajes son una estimación de gestión basada en entregables verificables, no una medición automática de líneas de código.

## Desglose del MVP real

| Bloque | Peso | Estado | Aporte actual |
|---|---:|---:|---:|
| Descubrimiento, alcance y UX/UI | 20% | 95% | 19% |
| Flujos operacionales del frontend | 25% | 88% | 22% |
| Reglas de negocio, integridad y continuidad | 15% | 87% | 13% |
| Backend, API y persistencia | 20% | 20% | 4% |
| Seguridad mínima y despliegue | 10% | 20% | 2% |
| Validación real con usuarios | 10% | 0% | 0% |
| **Total** | **100%** |  | **60%** |

## Lo que ya está listo

- Inicio operacional guiado.
- Catálogo y tienda pública.
- Preparación, pesaje y confirmación de diferencias.
- Inventario perecible por lotes y priorización FEFO.
- Compras, costos, precios sugeridos y proveedores.
- Ventas, cobros, entregas y comprobante interno.
- Fiados, abonos y saldos.
- Cierre diario y conciliación de caja.
- Integridad local, respaldo, restauración y auditoría encadenada.
- Navegación móvil, modo fácil, confirmaciones y acciones reversibles.
- 110 pruebas del piloto aprobadas antes de iniciar este bloque.

## Bloque backend en construcción

La primera fundación Django incorpora:

- Django 5.2 LTS y Django REST Framework.
- PostgreSQL para despliegue; SQLite únicamente para desarrollo y CI.
- Organizaciones y membresías.
- Roles owner, manager, operator y viewer.
- Catálogo, lotes, pedidos e ítems.
- API versionada `/api/v1/`.
- Autenticación por token para el piloto cerrado.
- Scope obligatorio por organización.
- Control optimista por versión.
- Auditoría servidor append-only con HMAC-SHA256.
- Admin Django para preparar el piloto.
- Docker Compose y pruebas API.

Al completar y fusionar esta fundación, el MVP real debería subir aproximadamente a **66%**. El incremento siguiente vendrá de conectar la UI al backend, no de agregar más pantallas.

## Criterio de MVP para Camila y Carmelo

El MVP se considera listo para la primera prueba real cuando:

1. ambos tienen cuentas separadas;
2. cada acción queda asociada a un usuario y organización;
3. productos, lotes y pedidos persisten en PostgreSQL;
4. la interfaz conserva los mismos flujos simples;
5. se puede operar desde dos sesiones sin perder ni mezclar datos;
6. existe un respaldo antes de la prueba;
7. errores y comentarios se registran durante los escenarios;
8. no se ingresan datos sensibles innecesarios.

## Escenarios de validación

Camila y Carmelo deben intentar, sin entrenamiento técnico prolongado:

1. ingresar y reconocer el inicio;
2. registrar o consultar un producto;
3. registrar una recepción de inventario;
4. crear y preparar un pedido;
5. cobrarlo o dejarlo fiado;
6. revisar un saldo;
7. cerrar el día;
8. recuperar una tarea después de salir y volver a entrar.

Se medirá éxito, tiempo, errores, dudas, retrocesos y necesidad de ayuda. La opinión estética se registrará, pero tendrá menor peso que la capacidad de completar la tarea.
