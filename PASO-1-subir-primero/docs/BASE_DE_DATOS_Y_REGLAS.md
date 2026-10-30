# Esquema de base de datos y reglas de negocio

El esquema completo, con llaves, restricciones, índices y triggers, está en `migrations/001_init.sql`.

## Tablas

| Tabla | Contenido | Llaves y restricciones principales |
|---|---|---|
| `users` | Cuentas, rol, permisos extra y revocados, bloqueo, último acceso | `lower(username)` único; trigger de **máximo 10 activos** |
| `sessions` | Sesiones abiertas (se guarda el hash del token, no el token) | FK → users; `token_hash` único |
| `password_resets` | Enlaces de restablecimiento de un solo uso | Expiran en 1 hora |
| `login_attempts` | Intentos de acceso (para el límite por IP) | Índice (ip, at) |
| `system_config` | Configuración (clave → valor JSON) | PK `key` |
| `counters` | Folios consecutivos por año (contratos, recibos, clientes) | PK (name, year) |
| `lots` | Catálogo de terrenos y precios vigentes | `lot_key` único; CHECK de estatus y de precios ≥ 0 |
| `lot_price_history` | Valores anteriores y nuevos de cada cambio de precio | FK → lots, price_imports, users |
| `price_imports` | Importaciones: vista previa, aplicada o cancelada, resumen y errores | FK → users |
| `clients` | Clientes y datos fiscales | `code` único; índices por nombre, teléfono y RFC |
| `documents` | Metadatos de documentos (el archivo vive en almacenamiento privado) | FK → clients / contracts; `storage_key` único |
| `contracts` | Contratos con **copia de las condiciones pactadas** (`list_snapshot`) | `contract_number` único; **índice único parcial: un contrato no cancelado por lote**; CHECK: la excepción exige motivo y autorizador; la cancelación exige motivo; sin DELETE |
| `schedule_items` | Calendario: apartado, enganche y mensualidades | Único (contract_id, kind, number); importe ≥ 0 |
| `payments` | Aportaciones recibidas | `receipt_number` y `idempotency_key` únicos; capital e interés ≥ 0; total calculado; **sin DELETE**; importes no editables; sólo se pasa a CANCELADA |
| `payment_applications` | Distribución auditable del capital sobre el calendario | FK → payments, schedule_items |
| `payment_reversals` | Cancelaciones: motivo, usuario y fecha | Único por pago |
| `contract_imports` | Importaciones de contratos y pagos históricos | FK → users |
| `audit_log` | Historial de auditoría | **Inmutable**: triggers bloquean UPDATE, DELETE y TRUNCATE |

## Reglas de negocio implementadas

**Precios (lista Hacienda Paraíso).**
- Mensualidad = (precio financiado − enganche) ÷ plazo, redondeada a centavos. La **última** aportación absorbe la diferencia, de modo que la suma del calendario es exactamente igual al precio pactado.
- El "costo por m²" de la lista es informativo; no se usa en ningún cálculo, porque no coincide con el precio de contado.

**Apartado** (configurable, y también por contrato):
- *Abono al precio* (predeterminado): saldo financiado = precio − enganche − apartado. El apartado es una obligación propia del calendario.
- *Parte del enganche*: saldo financiado = precio − enganche, y el apartado se abona al enganche.

**Contratos.**
- Toman precio, enganche y plazo de la lista vigente.
- Las condiciones distintas requieren el permiso "Autorizar condiciones especiales" y un motivo; quedan marcadas como excepción.
- Contado: un pago único con vencimiento en la fecha del contrato (o la indicada).
- Primera aportación: por omisión, un mes después del contrato. El día de pago se respeta y, en meses más cortos, se usa el último día del mes.

**Aplicación de pagos.**
- Apartado → obligación de apartado; enganche → enganche; mensual, extraordinario, liquidación y ajuste → mensualidades, de la más antigua a la más reciente.
- Si sobra, pasa a las siguientes obligaciones. El interés moratorio se registra aparte y no se aplica a capital.
- No se acepta capital mayor que el saldo pendiente.
- Al cancelar una aportación se vuelven a aplicar todas las confirmadas del contrato, en orden de fecha efectiva.

**Estatus de obligaciones.**
- Pagada (saldo 0), Parcialmente pagada (abono parcial), Vencida (sin pago y fecha vencida), Por vencer, Cancelada.
- "Vencida" usa los días de gracia configurados.

**Estatus de cobranza del contrato.**
- Atrasado: tiene alguna obligación vencida con saldo.
- Próximo a vencer: tiene un vencimiento dentro de N días (configurable, por omisión 5).
- Al corriente: ninguno de los anteriores.
- Liquidado, Cancelado y En revisión tienen prioridad sobre los anteriores.
- El estatus se calcula por contrato, de modo que los pagos de un terreno nunca afectan a otro.

**Liquidación automática.** Con capital pendiente en 0, el contrato y el terreno pasan a Liquidado. Si después se cancela un pago, regresan a Activo y Contratado.

**Terrenos.** Contratado y Liquidado se asignan por contrato. Disponible, Apartado, Suspendido y Cancelado son manuales (con motivo) y sólo sin contrato vigente. Al cancelar un contrato, el terreno vuelve a Disponible.

**Dashboard.** Las ventas se cuentan por **fecha de contrato** (sin contratos cancelados) y la cobranza por **fecha efectiva** (sólo aportaciones confirmadas).
