# Estado del MVP · Crohnoz Fresh Market

Fecha de corte: 2 de agosto de 2026.

## Lectura ejecutiva

El producto tiene tres porcentajes distintos y no deben confundirse:

| Alcance | Avance estimado | Interpretación |
|---|---:|---|
| Piloto navegable y demostrable | 92% | La experiencia visual, flujos principales y pantalla de conexión existen y pueden recorrerse con datos ficticios. |
| MVP real para Camila y Carmelo | 70% | Django y el puente de sesión están implementados; faltan despliegue API/PostgreSQL, migración de operaciones y validación presencial. |
| Producto comercial endurecido | 40% | Existe base multiempresa, RBAC, auditoría y sesión finita, pero faltan backups automáticos, observabilidad, privacidad, soporte y preparación tributaria. |

Los porcentajes son una estimación de gestión basada en entregables verificables, no una medición automática de líneas de código.

## Desglose del MVP real

| Bloque | Peso | Estado | Aporte actual |
|---|---:|---:|---:|
| Descubrimiento, alcance y UX/UI | 20% | 95% | 19% |
| Flujos operacionales del frontend | 25% | 90% | 22,5% |
| Reglas de negocio, integridad y continuidad | 15% | 87% | 13% |
| Backend, API y persistencia | 20% | 60% | 12% |
| Seguridad mínima y despliegue | 10% | 35% | 3,5% |
| Validación real con usuarios | 10% | 0% | 0% |
| **Total redondeado** | **100%** |  | **70%** |

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
- Fundación Django con organizaciones, roles, catálogo, lotes, pedidos y auditoría servidor.
- Pantalla de conexión con prueba de salud, login, logout, selección de organización y resumen del servidor.
- Sesiones almacenadas solo durante la pestaña y tokens con vencimiento máximo de 12 horas por defecto.
- Comando seguro para preparar cuentas separadas de Camila y Carmelo sin contraseñas predeterminadas.
- CI dual para frontend y backend.

## Puente backend completado en esta fase

La versión `0.6.0-pilot` incorpora:

- URL API configurable;
- validación HTTPS, salvo localhost;
- estado visible local/configurado/conectado;
- login individual con mensajes en español;
- límite de intentos de login;
- token temporal y cierre de sesión servidor;
- elección explícita de organización;
- resumen de productos, lotes, pedidos y auditoría;
- vista previa del catálogo remoto;
- modo local como rollback explícito;
- caché offline de la pantalla, sin fingir que la API funciona offline.

## Lo que todavía sigue local

Aunque exista una sesión conectada, estas operaciones todavía usan `localStorage`:

- venta rápida;
- preparación y pesaje;
- cambios de precio;
- recepción y ajustes de inventario;
- pagos y fiados;
- cierre diario;
- respaldos operacionales.

La franja superior muestra el estado de conexión para evitar que el operador interprete erróneamente que todo ya está sincronizado.

## Próximo incremento crítico

1. desplegar Django bajo HTTPS;
2. desplegar PostgreSQL administrado;
3. configurar secretos, CORS y CSP exactos;
4. ejecutar migraciones y `seed_pilot`;
5. conectar lectura de catálogo;
6. conectar creación y consulta de pedidos;
7. probar dos sesiones simultáneas;
8. agregar health monitoring y backup inicial.

Al completar despliegue y catálogo/pedidos remotos, el MVP debería alcanzar aproximadamente **80%**.

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

1. ingresar y reconocer su nombre, rol y negocio;
2. registrar o consultar un producto;
3. registrar una recepción de inventario;
4. crear y preparar un pedido;
5. cobrarlo o dejarlo fiado;
6. revisar un saldo;
7. cerrar el día;
8. recuperar una tarea después de salir y volver a entrar.

Se medirá éxito, tiempo, errores, dudas, retrocesos y necesidad de ayuda. La opinión estética se registrará, pero tendrá menor peso que la capacidad de completar la tarea.
