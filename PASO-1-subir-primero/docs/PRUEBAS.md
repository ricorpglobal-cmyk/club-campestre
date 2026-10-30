# Pruebas ejecutadas y resultados

**Fecha de ejecución:** 29/10/2026, entorno local con PostgreSQL 16 y Node.js 22.
**Resultado:** 42 de 42 pruebas automatizadas aprobadas (32 de integración contra PostgreSQL real y 10 de HTTP contra el servidor compilado en modo producción). Además se hizo un recorrido completo de la interfaz con un navegador automatizado (Chromium), sin errores en la consola.

Todas las pruebas se **ejecutaron realmente**. Ninguna es simulada ni se reporta como aprobada sin haberse corrido.

## Cumplimiento de los 26 criterios de aceptación

| # | Criterio | Cómo se verificó | Resultado |
|---|---|---|---|
| 1 | Iniciar sesión con usuarios autorizados | services + http (login y cookie) + navegador | ✅ |
| 2 | Rechazar credenciales incorrectas | services (401 y bloqueo tras 5 intentos) + http (sin cookie) | ✅ |
| 3 | Impedir la cuenta activa número 11 | services: por la app y con INSERT directo a la base (trigger) y al reactivar | ✅ |
| 4 | Restringir funciones según el rol | http: Ventas → 403 en aportaciones, usuarios, importación y reportes de cobranza; Cobranza → 403 en contratos y clientes | ✅ |
| 5 | Importar la lista de precios | services con el archivo real (253 lotes, 0 errores, 79 resaltados) + navegador | ✅ |
| 6 | Detectar terrenos duplicados | services: duplicados, precios faltantes, negativos y no numéricos | ✅ |
| 7 | Actualizar precios sin alterar contratos | services: lote 2 a $199,000; el contrato conserva $180,000 y su calendario | ✅ |
| 8 | Alta de cliente | services + navegador | ✅ |
| 9 | Contrato a 36 meses | services: 36 × $4,444.44 y la última de $4,444.60; total exacto | ✅ |
| 10 | Contrato a 48 meses | services: lote 1, enganche de $40,000 y apartado de $5,000 | ✅ |
| 11 | Calendario de aportaciones | services: fechas mensuales y día 31 ajustado a meses cortos | ✅ |
| 12 | Registrar enganche | services + navegador | ✅ |
| 13 | Registrar aportación mensual | services | ✅ |
| 14 | Pago parcial | services: obligación "Parcialmente pagada" y vencida | ✅ |
| 15 | Consultar estado de cuenta | services (totales y PDF) + navegador + descarga de PDF y Excel | ✅ |
| 16 | Saldos actualizados | services: capital pendiente exacto al centavo | ✅ |
| 17 | Terrenos disponibles | services (conteo del dashboard contra la base) + navegador | ✅ |
| 18 | No duplicar contrato activo | services: rechazo por la app (409) y por la base (índice único) | ✅ |
| 19 | Dashboard diario, mensual y anual | services (ventas ≠ cobranza; comparativo de 12 meses) + navegador | ✅ |
| 20 | Descargar reportes .xlsx | services (8 reportes) + http (cabecera y archivo válido) | ✅ |
| 21 | Reportes coinciden con la base | services: número de filas y total de la cobranza por día = consulta SQL | ✅ |
| 22 | Cancelación autorizada | services: exige motivo, registra el reverso y cancela contrato | ✅ |
| 23 | Cancelados no suman a la cobranza | services: el total histórico baja exactamente lo cancelado | ✅ |
| 24 | Persistencia tras cerrar sesión | http (logout → 401 → login → datos presentes) + reinicio del servidor con los mismos conteos | ✅ |
| 25 | Permisos sobre documentos fiscales | http: admin 200; Ventas 403; sin sesión 401; RFC oculto a Ventas; archivo falso rechazado | ✅ |
| 26 | Importes históricos sin cambio | services (igual que el 7) | ✅ |

## Pruebas adicionales

- Idempotencia: reintentar con la misma clave no duplica la aportación.
- Aviso de posible duplicado (mismo día e importe) con confirmación obligatoria.
- Rechazo de fechas futuras, importes negativos, contratos inexistentes y pagos mayores al saldo.
- Liquidación: un contrato de contado pagado pasa a Liquidado (contrato y terreno) y regresa a Activo si se cancela el pago.
- Base de datos: no se pueden borrar aportaciones, editar sus importes ni modificar o truncar la auditoría.
- Condiciones especiales: requieren permiso y motivo, y registran quién las autorizó.
- Importación de contratos: un error impide aplicar todo el archivo; la carga correcta agrupa al mismo cliente, respeta precios históricos y no puede aplicarse dos veces.
- Protección CSRF: una petición de otro origen recibe 403.
- Primer acceso: con contraseña temporal sólo se puede cambiar la contraseña.

## Salida de las pruebas

### Integración (tests/services.test.ts)
```
✓ tests/services.test.ts > Criterio 1-3: acceso y límite de 10 cuentas activas > inicia sesión con credenciales correctas y rechaza incorrectas 139ms
✓ tests/services.test.ts > Criterio 1-3: acceso y límite de 10 cuentas activas > bloquea la cuenta tras 5 intentos fallidos 213ms
✓ tests/services.test.ts > Criterio 1-3: acceso y límite de 10 cuentas activas > impide la cuenta activa número 11 (app y base de datos) 346ms
✓ tests/services.test.ts > Criterio 1-3: acceso y límite de 10 cuentas activas > un administrador no puede quitarse su propio rol 3ms
✓ tests/services.test.ts > Criterio 1-3: acceso y límite de 10 cuentas activas > las contraseñas se guardan con hash argon2 1ms
✓ tests/services.test.ts > Criterio 5-6: importación de la lista de precios > lee la lista real de Hacienda Paraíso: 253 lotes, sin errores 454ms
✓ tests/services.test.ts > Criterio 5-6: importación de la lista de precios > re-importar la misma lista no crea duplicados 135ms
✓ tests/services.test.ts > Criterio 5-6: importación de la lista de precios > detecta lotes duplicados, precios faltantes e inválidos 6ms
✓ tests/services.test.ts > Criterio 8-11: clientes, contratos y calendario > da de alta un cliente 18ms
✓ tests/services.test.ts > Criterio 8-11: clientes, contratos y calendario > registra un contrato a 36 meses con calendario exacto 47ms
✓ tests/services.test.ts > Criterio 8-11: clientes, contratos y calendario > registra un contrato a 48 meses (lote 1, enganche 40,000) 21ms
✓ tests/services.test.ts > Criterio 8-11: clientes, contratos y calendario > día de pago 31 se ajusta al último día de meses cortos 3ms
✓ tests/services.test.ts > Criterio 18: no se duplica un contrato activo > rechaza un segundo contrato para el mismo terreno 4ms
✓ tests/services.test.ts > Criterio 18: no se duplica un contrato activo > una condición especial exige permiso y motivo 28ms
✓ tests/services.test.ts > Criterio 12-17: aportaciones, saldos y estado de cuenta > registra el enganche 18ms
✓ tests/services.test.ts > Criterio 12-17: aportaciones, saldos y estado de cuenta > registra una aportación mensual completa 12ms
✓ tests/services.test.ts > Criterio 12-17: aportaciones, saldos y estado de cuenta > registra un pago parcial 19ms
✓ tests/services.test.ts > Criterio 12-17: aportaciones, saldos y estado de cuenta > el reintento con la misma clave no duplica la aportación 3ms
✓ tests/services.test.ts > Criterio 12-17: aportaciones, saldos y estado de cuenta > advierte posible duplicado (mismo día e importe) y exige confirmación 5ms
✓ tests/services.test.ts > Criterio 12-17: aportaciones, saldos y estado de cuenta > valida importes, fechas y contratos 16ms
✓ tests/services.test.ts > Criterio 12-17: aportaciones, saldos y estado de cuenta > estado de cuenta y saldos correctos 80ms
✓ tests/services.test.ts > Criterio 12-17: aportaciones, saldos y estado de cuenta > un adelanto se aplica a las siguientes aportaciones y se identifica 19ms
✓ tests/services.test.ts > Criterio 22-23: cancelaciones y reversos > cancela una aportación con motivo; no se suma a la cobranza efectiva 102ms
✓ tests/services.test.ts > Criterio 22-23: cancelaciones y reversos > no permite borrar aportaciones ni modificar la auditoría 16ms
✓ tests/services.test.ts > Criterio 22-23: cancelaciones y reversos > liquidación: contrato de contado pasa a LIQUIDADO y se revierte al cancelar el pago 42ms
✓ tests/services.test.ts > Criterio 22-23: cancelaciones y reversos > cancela un contrato: el terreno se libera y el historial se conserva 51ms
✓ tests/services.test.ts > Criterio 7 y 26: actualizar precios no altera contratos > cambia el precio del lote 2 en la lista sin tocar el contrato pactado 79ms
✓ tests/services.test.ts > Criterio 17, 19: terrenos disponibles y dashboard > distingue ventas contratadas de cobranza recibida 43ms
✓ tests/services.test.ts > Criterio 20-21: reportes .xlsx coinciden con la base > cobranza por día y cartera vencida 365ms
✓ tests/services.test.ts > Criterio 20-21: reportes .xlsx coinciden con la base > respeta permisos al exportar 14ms
✓ tests/services.test.ts > Importación de contratos y pagos históricos > un error en el archivo impide aplicar y no carga nada 130ms
✓ tests/services.test.ts > Importación de contratos y pagos históricos > carga contratos históricos con su precio pactado y aplica los pagos 194ms
```

### HTTP (tests/http.test.ts)
```
✓ tests/http.test.ts > HTTP: autenticación, permisos y persistencia > rechaza credenciales incorrectas y no deja cookie de sesión 59ms
✓ tests/http.test.ts > HTTP: autenticación, permisos y persistencia > sin sesión, la API responde 401 y las páginas redirigen a /login 118ms
✓ tests/http.test.ts > HTTP: autenticación, permisos y persistencia > bloquea peticiones de otro origen (CSRF) 9ms
✓ tests/http.test.ts > HTTP: autenticación, permisos y persistencia > el administrador crea usuarios de Ventas y Cobranza 300ms
✓ tests/http.test.ts > HTTP: autenticación, permisos y persistencia > Ventas no puede registrar aportaciones, administrar usuarios ni importar precios (verificado en el backend) 154ms
✓ tests/http.test.ts > HTTP: autenticación, permisos y persistencia > Cobranza no puede crear contratos ni clientes 65ms
✓ tests/http.test.ts > HTTP: autenticación, permisos y persistencia > la información fiscal y la constancia sólo son visibles con permiso 150ms
✓ tests/http.test.ts > HTTP: autenticación, permisos y persistencia > los datos persisten después de cerrar sesión 72ms
✓ tests/http.test.ts > HTTP: autenticación, permisos y persistencia > descarga reportes .xlsx con nombre descriptivo 28ms
✓ tests/http.test.ts > HTTP: autenticación, permisos y persistencia > limpieza: desactiva los usuarios de prueba 42ms
```

## Limitaciones conocidas

- **Reestructuras:** no hay pantalla para cambiar las condiciones económicas de un contrato ya firmado. Para reestructurarlo, cancélelo con motivo y registre un contrato nuevo (o un "Ajuste autorizado"). El estatus "Reestructurada" existe en el modelo para una siguiente fase.
- **Moratorios:** vienen desactivados porque la lista indica que el financiamiento no tiene intereses. Si se activan, se calculan con interés simple diario (tasa mensual ÷ 30 × días de atraso después de la gracia) sobre el saldo vencido de las mensualidades.
- **Distribución de pagos:** se aplica de forma automática y determinista (la obligación más antigua del concepto primero) y se muestra antes de confirmar. No hay distribución manual libre entre obligaciones.
- **Correo:** la recuperación por correo requiere configurar SMTP. Sin él, el administrador genera enlaces de un solo uso.
- **Límite por IP:** el bloqueo por intentos se apoya en la cabecera `X-Forwarded-For` del proxy de la plataforma de hospedaje.
- Las pruebas se ejecutaron en el entorno de desarrollo. Tras desplegar, conviene repetir la carga de la lista y un contrato de prueba en el entorno real (y después cancelarlo).
