# Manual de usuario — Club Campestre | Sistema de Control de Ventas y Cobranza

## Conceptos clave

- **Ventas contratadas:** el importe de los contratos firmados en un periodo. Se cuentan por **fecha de contrato**.
- **Cobranza recibida:** el dinero efectivamente registrado como recibido. Se cuenta por **fecha efectiva de recepción**.
- Firmar un contrato **no** suma cobranza. Una aportación sólo programada **no** cuenta como recibida.
- Las aportaciones **canceladas** se conservan en el historial, pero no suman en ningún total.

## Roles

| Rol | Puede |
|---|---|
| Administrador | Todo: usuarios, configuración, importaciones, correcciones y auditoría. |
| Ventas | Consultar terrenos, dar de alta clientes y contratos, y ver reportes de ventas. |
| Cobranza | Consultar contratos y calendario, registrar aportaciones, emitir recibos, ver estados de cuenta y reportes de cobranza. |
| Consulta / Dirección | Sólo lectura de indicadores, contratos, estados de cuenta y reportes. |

El administrador puede **agregar o quitar permisos** a cada usuario en Usuarios → Editar. Por ejemplo, puede permitir que Cobranza cancele aportaciones o que alguien vea la información fiscal.

## Primer acceso

1. Entre con el usuario y la contraseña temporal que le entregó el administrador.
2. El sistema le pedirá una contraseña nueva: mínimo 10 caracteres, con letras y números.
3. Si olvida su contraseña, use "¿Olvidó su contraseña?" en la pantalla de inicio o pida al administrador un enlace de restablecimiento.

## Dashboard

Filtre por fecha inicial y final, día, mes, año, terreno, estatus o usuario responsable. Las tarjetas se dividen en **indicadores comerciales** y **de cobranza**. La sección "Comparativo mensual" muestra de enero a diciembre; haga clic en un mes para filtrarlo.

## Terrenos

- La lista muestra precios vigentes, estatus y el contrato relacionado, si existe.
- En el detalle de cada terreno el administrador puede cambiarlo manualmente a Disponible, Apartado, Suspendido o Cancelado, indicando el motivo. Los estatus Contratado y Liquidado los asigna el sistema.
- El historial de precios muestra cada cambio con su usuario y su importación.

### Importar lista de precios

1. Administración → Importar lista de precios → seleccione el archivo .xlsx o .csv.
2. El sistema detecta las columnas (LOTE, M², contado, 36 y 48 meses, enganches y mensualidades) y muestra:
   - terrenos nuevos;
   - terrenos con cambios (precio anterior → nuevo);
   - errores: lotes duplicados, precios faltantes o inválidos.
3. Revise y pulse **Aplicar cambios → Confirmar**. Si se arrepiente, pulse **Cancelar importación**.
4. Descargue el **reporte de resultados** desde el historial.

> Actualizar la lista **no cambia** los contratos existentes: cada contrato guarda una copia de sus condiciones pactadas.

## Clientes

- **Nuevo cliente:** el nombre es obligatorio; el resto es opcional. La información fiscal (RFC y Constancia de Situación Fiscal) sólo la ven y capturan usuarios con permiso.
- **Expediente:** datos, contratos con saldo y próximo pago, historial de aportaciones, documentos e historial de cambios.
- **Búsqueda:** por nombre, teléfono, número de terreno o ID de cliente, y por RFC si tiene permiso.

## Contratos

1. Contratos → **Nuevo contrato**.
2. Busque al cliente, elija el terreno disponible y el plan: contado, 36 o 48 meses.
3. El sistema toma precio, enganche y número de aportaciones de la lista vigente. Capture la fecha del contrato y, si existe, el apartado.
4. Revise el **resumen y el calendario proyectado**. La última aportación absorbe los centavos de diferencia para que el total cuadre exacto con el precio.
5. **Condiciones especiales:** sólo usuarios con permiso. Marque la casilla, capture precio, enganche o plazo distintos y el **motivo**; queda registrado quién lo autorizó.
6. Pulse **Guardar contrato → Confirmar**. El terreno pasa a Contratado.

Dentro del contrato puede marcarlo "En revisión", adjuntar el contrato firmado o **cancelarlo** con motivo. Al cancelarlo, el terreno se libera y el historial se conserva.

### Importar contratos existentes

1. Contratos → **Importar contratos** → **Descargar plantilla Excel**.
2. Hoja **Contratos**: un contrato por fila, con los datos **del contrato firmado**: número, fecha, lote, plan, precio pactado, enganche, número de aportaciones, cliente.
3. Hoja **Pagos**: cada pago recibido, con contrato, fecha, concepto, capital, interés y forma de pago.
4. Cargue el archivo. Si hay un solo error, no se carga nada; corrija y vuelva a cargar.
5. Confirme. Los pagos se aplican en orden de fecha y los saldos quedan calculados.

## Aportaciones

1. Aportaciones → **Registrar aportación** (o desde el contrato o el calendario, con el botón "Cobrar").
2. Elija el contrato y capture la fecha efectiva (no puede ser futura), el concepto, el capital, el interés si aplica, la forma de pago y la referencia.
3. Pulse **Revisar antes de guardar**. Verá a qué obligaciones se aplica el pago, con la más antigua primero y las aportaciones adelantadas marcadas.
4. Si existe otro pago del mismo día por el mismo importe, el sistema le pedirá confirmar que no es un duplicado.
5. Al guardar se genera un **recibo** con folio, que puede imprimir en PDF.

**Pagos parciales:** se aplican a la obligación pendiente, que queda como "Parcialmente pagada".
**Cancelar una aportación:** sólo con permiso y motivo. No se borra: queda marcada y deja de sumar.

## Calendario de cobros

Use los accesos rápidos (Hoy, Mañana, Esta semana, Este mes, Vencidas, Próximas a vencer, Pagos parciales) o filtre por fechas, contrato, terreno y estatus. Cada fila muestra lo programado, lo pagado, el saldo y los días de atraso.

## Estados de cuenta

Seleccione el contrato y verá datos generales, resumen financiero e historial ordenado por fecha. Puede **descargarlo en PDF o Excel**, o imprimirlo. Siempre se calcula con las operaciones confirmadas.

## Reportes y exportaciones

Ventas por día y por mes, cobranza por día, por mes y por cliente, cartera vencida, inventario de terrenos y estado de cuenta individual. Elija los filtros y pulse **Descargar .xlsx**. Cada exportación queda en la auditoría.

## Configuración (administrador)

Tratamiento del apartado, días para "próximo a vencer", días de gracia, moratorios (desactivados por omisión, porque la lista indica que el financiamiento no tiene intereses), prefijos de folio, bloqueo por intentos y duración de sesión.

## Auditoría

Consulte quién hizo qué y cuándo: accesos, altas, cambios, importaciones, pagos, cancelaciones, exportaciones y cambios de permisos. Este historial no se puede modificar ni borrar.
