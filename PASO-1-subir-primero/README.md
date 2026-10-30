# CLUB CAMPESTRE | SISTEMA DE CONTROL DE VENTAS Y COBRANZA

Aplicación web para administrar la venta de terrenos de Club Campestre "Hacienda Paraíso". Incluye catálogo y listas de precios, clientes, contratos a contado, 36 y 48 meses, aportaciones, calendario de cobros, estados de cuenta, dashboard, reportes en Excel y auditoría.

- **Interfaz:** español, montos en MXN, fechas DD/MM/AAAA, zona horaria configurable (por omisión `America/Mexico_City`).
- **Usuarios:** máximo 10 cuentas activas. El límite se valida en la aplicación y también en la base de datos.
- **Datos:** PostgreSQL. Todo persiste al cerrar sesión, cerrar el navegador o reiniciar el servidor.

---

## ⚡ Puesta en producción rápida (Render, sin consola)

El archivo `render.yaml` crea todo automáticamente: servidor con HTTPS, base PostgreSQL con respaldos diarios y disco privado para documentos. Al primer arranque se crean las tablas y el primer administrador.

1. **GitHub:** cree un repositorio **privado** vacío (por ejemplo `club-campestre`) y suba el contenido de esta carpeta.
2. **Render** (render.com): cree su cuenta y conecte GitHub. Luego **New → Blueprint**, elija el repositorio y capture sólo:
   - `ADMIN_USERNAME`: su usuario, por ejemplo `ricardo`;
   - `ADMIN_FULL_NAME` y `ADMIN_EMAIL`;
   - `ADMIN_PASSWORD`: contraseña **temporal** (mínimo 10 caracteres, con letras y números). El sistema le pedirá cambiarla al entrar.

   Pulse **Apply**. En unos minutos el sistema queda en `https://club-campestre.onrender.com` (o el nombre que asigne Render).
3. Entre, cambie la contraseña e **importe la lista de precios** y después **sus contratos** (plantilla en Contratos → Importar).

Opcional: en Render → servicio → *Settings → Custom Domains* agregue `ventas.su-dominio.mx` y cree el CNAME que le indique.

Costo: el Blueprint usa planes de pago básicos (servidor *starter*, PostgreSQL *basic-256mb* y 1 GB de disco), porque los gratuitos se apagan o borran datos. Consulte el precio vigente en render.com/pricing.

---

## 1. Arquitectura

| Capa | Tecnología | Notas |
|---|---|---|
| Interfaz y API | Next.js 15 (React 19) + TypeScript | Una sola aplicación. Las páginas se generan en el servidor y los endpoints viven en `src/app/api`. |
| Estilos | Tailwind CSS | Diseño adaptable (computadora, tableta y celular). |
| Base de datos | PostgreSQL 14+ | Migraciones SQL en `migrations/`, aplicadas con `npm run db:migrate`. |
| Autenticación | Contraseñas con hash **argon2id** y sesiones en la base | La cookie es `httpOnly`, `secure` y `SameSite=Lax`, y se valida el origen en cada operación de escritura. |
| Documentos | Carpeta privada del servidor o S3 / Cloudflare R2 | Nunca son públicos. Se entregan sólo por un endpoint con permiso y cada consulta queda auditada. |
| Excel y PDF | ExcelJS, PDFKit | Lectura (importaciones) y generación (reportes, estados de cuenta, recibos). |

### Reglas que se garantizan en la base de datos (no sólo en la app)

- **Máximo 10 usuarios activos:** trigger `users_max_active`.
- **Un solo contrato vigente por terreno:** índice único parcial `contracts_one_active_per_lot`. El historial de contratos cancelados se conserva.
- **Las aportaciones no se borran:** si hay un error, se cancelan con motivo; la cancelación queda en `payment_reversals`. Sus importes tampoco se pueden editar.
- **La auditoría es inmutable:** no admite `UPDATE`, `DELETE` ni `TRUNCATE`.
- **Importes:** no se aceptan negativos. Todos los cálculos se hacen en centavos enteros, sin errores de redondeo.

### Estructura de carpetas

```
migrations/            Esquema SQL (tablas, llaves, índices, triggers)
scripts/               migrate.ts, create-admin.ts, backup.sh, restore.sh
src/lib/               Núcleo: db, auth, permisos, auditoría, dinero, fechas, Excel
src/lib/services/      Reglas de negocio: terrenos, importación de precios, clientes,
                       contratos, aportaciones, ledger (saldos), dashboard, reportes, PDF,
                       importación de contratos, usuarios
src/app/(app)/         Páginas del sistema (con sesión)
src/app/api/           Endpoints (cada uno verifica sesión y permiso en el servidor)
src/components/        Componentes de interfaz
tests/                 Pruebas de integración (PostgreSQL real) y de HTTP
ejemplos/              Lista de precios real, plantilla de carga de contratos y CSV de ejemplo
docs/                  Manual de usuario, base de datos, reglas de negocio y resultados de pruebas
```

---

## 2. Instalación local

Requisitos: Node.js 20 o superior y PostgreSQL 14 o superior.

```bash
npm ci
cp .env.example .env        # capture DATABASE_URL, APP_URL y SESSION_SECRET
npm run db:migrate          # crea las tablas
npm run create-admin        # primer administrador (ver sección 3)
npm run build
npm start                   # http://localhost:3000
```

Si trabaja en local sin HTTPS, ponga `ALLOW_INSECURE_COOKIES=true` en `.env`. **Nunca use ese valor en producción.**

## 3. Crear el primer administrador de forma segura

El primer administrador **no** se crea desde la web; así nadie puede registrarse solo. Desde la consola del servidor:

```bash
npm run create-admin
```

El comando pide usuario, nombre, correo y contraseña. La contraseña no se muestra en pantalla y debe tener al menos 10 caracteres, con letras y números. Se guarda con hash argon2. Si ya existe un administrador activo, el comando se niega a crear otro (salvo con `--force`).

En plataformas sin consola interactiva puede usar variables de entorno **sólo para esa ejecución**:

```bash
ADMIN_USERNAME=admin ADMIN_FULL_NAME="Nombre" ADMIN_EMAIL=correo@dominio.mx ADMIN_PASSWORD='********' npm run create-admin
```

Después, cree a los demás usuarios desde **Administración → Usuarios**. El sistema genera una contraseña temporal que se muestra una sola vez y obliga a cambiarla en el primer acceso.

## 4. Puesta en marcha (orden recomendado)

1. **Importar lista de precios** (Administración): cargue `Lista_de_Precios_Hacienda_Paraiso.xlsx`. Revise la vista previa (253 lotes) y confirme.
2. **Importar contratos**: descargue la plantilla, capture sus contratos existentes y sus pagos históricos, y cárguela. Si el archivo tiene un solo error, no se aplica nada hasta corregirlo.
3. Revise **Configuración**: tratamiento del apartado, días de gracia, moratorios y prefijos de folio.
4. Cree los usuarios de Ventas, Cobranza y Dirección.

## 5. Despliegue en producción

Se recomienda **Railway** o **Render**, que ofrecen la aplicación, PostgreSQL administrado y HTTPS automático. También funciona en cualquier servidor con Docker (se incluye `Dockerfile`).

### Opción A — Railway (la más sencilla)

1. Suba este código a un repositorio privado de GitHub.
2. En Railway: **New Project → Deploy from GitHub repo** y elija el repositorio.
3. En el mismo proyecto agregue **PostgreSQL** (Add → Database → PostgreSQL).
4. En el servicio de la aplicación defina estas variables:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `APP_URL` = `https://ventas.su-dominio.mx`
   - `SESSION_SECRET` = el resultado de `openssl rand -hex 32`
   - `STORAGE_DRIVER=s3` y las variables `S3_*` (ver abajo), **o** `STORAGE_DRIVER=local` con un *Volume* montado en `/app/storage`.
5. Railway detecta el `Dockerfile`. Cada arranque aplica las migraciones pendientes y luego inicia el sistema.
6. Abra una consola del servicio (Railway → servicio → *Shell*) y ejecute `npm run create-admin`.
7. **Settings → Domains:** agregue su dominio y cree el registro CNAME que le indique Railway en su proveedor de DNS. El HTTPS es automático.

### Almacenamiento de documentos con Cloudflare R2 (recomendado)

1. En Cloudflare R2 cree un bucket privado (sin acceso público), por ejemplo `club-campestre-docs`.
2. Cree un *API token* de R2 con permiso de lectura y escritura **sólo sobre ese bucket**.
3. Defina las variables:
   - `STORAGE_DRIVER=s3`
   - `S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`
   - `S3_REGION=auto`
   - `S3_BUCKET=club-campestre-docs`
   - `S3_ACCESS_KEY_ID=…` y `S3_SECRET_ACCESS_KEY=…`

Con AWS S3 basta con dejar `S3_ENDPOINT` vacío y poner la región real.

### Correo para recuperar contraseñas (opcional)

Defina `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM` (sirven Resend, SendGrid, Google Workspace o el SMTP de su dominio). Sin correo configurado, el administrador genera desde **Usuarios** un enlace de un solo uso, válido 60 minutos.

### Opción B — Servidor propio (VPS) con Docker

```bash
docker build -t club-campestre .
docker run -d --name cc -p 3000:3000 --env-file .env -v /srv/cc-storage:/app/storage club-campestre
```

Ponga delante un proxy con HTTPS (Caddy o Nginx con Let's Encrypt).

## 6. Respaldo y recuperación

**Respaldo automático del proveedor.** Railway y Render respaldan PostgreSQL a diario. Verifique que esté activo en el panel de la base de datos.

**Respaldo propio (recomendado, además del anterior):**

```bash
DATABASE_URL=... ./scripts/backup.sh /ruta/respaldos
```

Genera `club_campestre_AAAA-MM-DD_HHMM.dump` con `pg_dump` y, si los documentos están en carpeta local, también `documentos_*.tar.gz`. Conserva los últimos 30. Prográmelo a diario con cron, por ejemplo `0 2 * * * ...`, y copie la carpeta fuera del servidor. Si los documentos están en R2/S3, active el versionado del bucket.

**Recuperación:**

1. Cree una base **nueva y vacía**. No restaure sobre la base en uso.
2. Ejecute `DATABASE_URL=<nueva> ./scripts/restore.sh respaldo.dump [documentos.tar.gz]`.
3. Ejecute `npm run db:migrate`; debe indicar "Migraciones al día".
4. Cambie `DATABASE_URL` de la aplicación a la base restaurada y reinicie.
5. Revise un estado de cuenta y el dashboard contra el último reporte exportado.

**Ante un error de captura no se borran datos:** las aportaciones y los contratos se cancelan con motivo, y todo queda en la auditoría.

**Conservación:** el sistema no elimina contratos, pagos ni documentos. Defina con su asesor legal el plazo de conservación aplicable (por ejemplo, el de la contabilidad y documentación fiscal) antes de depurar cualquier respaldo antiguo.

## 7. Pruebas

```bash
# Integración contra PostgreSQL real (usa una base cuyo nombre termina en _test; la reinicia en cada corrida)
TEST_DATABASE_URL=postgres://usuario@localhost:5432/club_campestre_test npm test

# HTTP de extremo a extremo contra un servidor en ejecución
E2E_URL=http://localhost:3000 E2E_ADMIN_PASSWORD='...' npx vitest run tests/http.test.ts
```

Los resultados de la última ejecución están en `docs/PRUEBAS.md`.

## 8. Seguridad (resumen)

- Las contraseñas se guardan con hash argon2id, nunca en texto plano. Política: mínimo 10 caracteres, con letras y números.
- Tras 5 intentos fallidos la cuenta se bloquea 15 minutos (configurable). También hay un límite de intentos por IP.
- Las sesiones se guardan en la base: se pueden consultar y cerrar a distancia, y expiran a las 12 horas (configurable). Al cambiar la contraseña se cierran las demás sesiones.
- Los permisos se verifican en **cada endpoint del servidor**. Ningún usuario puede cambiar su propio rol, y los permisos de administración no se pueden otorgar a otros roles.
- Las consultas usan parámetros (sin SQL concatenado), lo que protege contra inyección SQL. Los datos se validan con zod, se verifica el origen en las operaciones de escritura (CSRF) y se envían cabeceras de seguridad (HSTS, X-Frame-Options, nosniff).
- Los documentos se validan por su firma real (PDF/JPG/PNG), se guardan privados y se entregan sólo a usuarios con permiso. Cada consulta queda auditada.
- No hay secretos en el código. Todo se configura por variables de entorno (`.env.example` no contiene valores).
