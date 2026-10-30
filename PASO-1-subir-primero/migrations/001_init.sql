-- ============================================================
-- CLUB CAMPESTRE | SISTEMA DE CONTROL DE VENTAS Y COBRANZA
-- Migración 001: esquema inicial
-- ============================================================

-- ---------- Configuración del sistema ----------
CREATE TABLE system_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  INTEGER
);

INSERT INTO system_config (key, value) VALUES
  ('nombre_proyecto',            '"Club Campestre \"Hacienda Paraíso\""'),
  ('zona_horaria',               '"America/Mexico_City"'),
  ('modo_apartado',              '"PRECIO"'),      -- PRECIO | ENGANCHE
  ('dias_proximo_vencer',        '5'),
  ('dias_gracia_atraso',         '0'),
  ('moratorios_activos',         'false'),
  ('tasa_moratoria_mensual',     '0'),             -- porcentaje mensual, ej. 2 = 2%
  ('prefijo_contrato',           '"CC"'),
  ('prefijo_recibo',             '"REC"'),
  ('prefijo_cliente',            '"CLI"'),
  ('permitir_excepciones',       'true'),
  ('max_intentos_login',         '5'),
  ('minutos_bloqueo_login',      '15'),
  ('horas_sesion',               '12');

-- ---------- Usuarios, roles y permisos ----------
CREATE TABLE users (
  id                    SERIAL PRIMARY KEY,
  username              TEXT NOT NULL,
  full_name             TEXT NOT NULL,
  email                 TEXT,
  password_hash         TEXT NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('ADMINISTRADOR','VENTAS','COBRANZA','CONSULTA')),
  extra_permissions     TEXT[] NOT NULL DEFAULT '{}',
  revoked_permissions   TEXT[] NOT NULL DEFAULT '{}',
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,
  failed_attempts       INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  password_changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_uq ON users (lower(username));
CREATE UNIQUE INDEX users_email_uq ON users (lower(email)) WHERE email IS NOT NULL;

-- Límite duro de 10 cuentas activas (se valida en la base, no sólo en la app)
CREATE OR REPLACE FUNCTION enforce_max_active_users() RETURNS trigger AS $$
DECLARE n INTEGER;
BEGIN
  IF NEW.is_active THEN
    PERFORM pg_advisory_xact_lock(424242);
    SELECT count(*) INTO n FROM users WHERE is_active AND id <> NEW.id;
    IF n >= 10 THEN
      RAISE EXCEPTION 'LIMITE_USUARIOS: no se permiten más de 10 cuentas activas'
        USING ERRCODE = 'P0010';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER users_max_active
  BEFORE INSERT OR UPDATE OF is_active ON users
  FOR EACH ROW EXECUTE FUNCTION enforce_max_active_users();

CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INTEGER NOT NULL REFERENCES users(id),
  token_hash    TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  ip            TEXT,
  user_agent    TEXT,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE password_resets (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_by  INTEGER REFERENCES users(id)
);

CREATE TABLE login_attempts (
  id          BIGSERIAL PRIMARY KEY,
  username    TEXT,
  ip          TEXT,
  success     BOOLEAN NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_ip_idx ON login_attempts (ip, at);

-- ---------- Contadores de folios ----------
CREATE TABLE counters (
  name   TEXT NOT NULL,
  year   INTEGER NOT NULL,
  value  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (name, year)
);

-- ---------- Terrenos ----------
CREATE TABLE lots (
  id             SERIAL PRIMARY KEY,
  lot_key        TEXT NOT NULL UNIQUE,         -- clave validada: "<manzana>-<lote>" o "<lote>"
  lot_number     TEXT NOT NULL,
  block          TEXT,                          -- manzana
  street         TEXT,
  section        TEXT,                          -- colonia o sección
  area_m2        NUMERIC(12,2),
  cost_per_m2    NUMERIC(14,2),
  price_cash     NUMERIC(14,2),
  price_36       NUMERIC(14,2),
  down_36        NUMERIC(14,2),
  monthly_36     NUMERIC(14,2),
  price_48       NUMERIC(14,2),
  down_48        NUMERIC(14,2),
  monthly_48     NUMERIC(14,2),
  status         TEXT NOT NULL DEFAULT 'DISPONIBLE'
                 CHECK (status IN ('DISPONIBLE','APARTADO','CONTRATADO','LIQUIDADO','SUSPENDIDO','CANCELADO')),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (price_cash IS NULL OR price_cash >= 0),
  CHECK (price_36 IS NULL OR price_36 >= 0),
  CHECK (price_48 IS NULL OR price_48 >= 0)
);
CREATE INDEX lots_status_idx ON lots (status);
CREATE INDEX lots_block_idx ON lots (block);

CREATE TABLE price_imports (
  id            SERIAL PRIMARY KEY,
  filename      TEXT NOT NULL,
  file_sha256   TEXT NOT NULL,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at    TIMESTAMPTZ,
  status        TEXT NOT NULL CHECK (status IN ('VISTA_PREVIA','APLICADA','CANCELADA','ERROR')),
  column_map    JSONB,
  payload       JSONB,          -- registros normalizados de la vista previa
  summary       JSONB,
  errors        JSONB
);

CREATE TABLE lot_price_history (
  id           BIGSERIAL PRIMARY KEY,
  lot_id       INTEGER NOT NULL REFERENCES lots(id),
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by   INTEGER REFERENCES users(id),
  import_id    INTEGER REFERENCES price_imports(id),
  old_values   JSONB,
  new_values   JSONB NOT NULL
);
CREATE INDEX lot_price_history_lot_idx ON lot_price_history (lot_id, changed_at);

-- ---------- Clientes ----------
CREATE TABLE clients (
  id                      SERIAL PRIMARY KEY,
  code                    TEXT NOT NULL UNIQUE,
  full_name               TEXT NOT NULL,
  phone                   TEXT,
  phone2                  TEXT,
  email                   TEXT,
  street                  TEXT,
  ext_no                  TEXT,
  int_no                  TEXT,
  colony                  TEXT,
  municipality            TEXT,
  state                   TEXT,
  zip                     TEXT,
  rfc                     TEXT,
  fiscal_doc_received_at  DATE,
  fiscal_doc_status       TEXT NOT NULL DEFAULT 'SIN_DOCUMENTO'
                          CHECK (fiscal_doc_status IN ('SIN_DOCUMENTO','RECIBIDO','VALIDADO','RECHAZADO')),
  fiscal_notes            TEXT,
  notes                   TEXT,
  created_by              INTEGER REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clients_name_idx ON clients (lower(full_name));
CREATE INDEX clients_phone_idx ON clients (phone);
CREATE INDEX clients_rfc_idx ON clients (upper(rfc));

-- ---------- Contratos ----------
CREATE TABLE contracts (
  id                       SERIAL PRIMARY KEY,
  contract_number          TEXT NOT NULL UNIQUE,
  contract_date            DATE NOT NULL,
  client_id                INTEGER NOT NULL REFERENCES clients(id),
  lot_id                   INTEGER NOT NULL REFERENCES lots(id),
  plan                     TEXT NOT NULL CHECK (plan IN ('CONTADO','36','48','OTRO')),
  price_agreed             NUMERIC(14,2) NOT NULL CHECK (price_agreed > 0),
  apartado                 NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (apartado >= 0),
  apartado_mode            TEXT NOT NULL CHECK (apartado_mode IN ('PRECIO','ENGANCHE')),
  enganche                 NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (enganche >= 0),
  financed                 NUMERIC(14,2) NOT NULL CHECK (financed >= 0),
  n_installments           INTEGER NOT NULL CHECK (n_installments >= 0),
  installment_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  first_due_date           DATE,
  pay_day                  INTEGER CHECK (pay_day BETWEEN 1 AND 31),
  est_end_date             DATE,
  list_snapshot            JSONB NOT NULL,       -- copia de las condiciones de la lista vigente al contratar
  is_exception             BOOLEAN NOT NULL DEFAULT FALSE,
  exception_reason         TEXT,
  exception_authorized_by  INTEGER REFERENCES users(id),
  responsible_user_id      INTEGER REFERENCES users(id),
  status                   TEXT NOT NULL DEFAULT 'ACTIVO'
                           CHECK (status IN ('ACTIVO','LIQUIDADO','CANCELADO','EN_REVISION')),
  notes                    TEXT,
  source                   TEXT NOT NULL DEFAULT 'CAPTURA' CHECK (source IN ('CAPTURA','IMPORTACION')),
  cancel_reason            TEXT,
  cancelled_at             TIMESTAMPTZ,
  cancelled_by             INTEGER REFERENCES users(id),
  created_by               INTEGER REFERENCES users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT is_exception OR (exception_reason IS NOT NULL AND exception_authorized_by IS NOT NULL)),
  CHECK (status <> 'CANCELADO' OR cancel_reason IS NOT NULL)
);
-- Un terreno no puede tener dos contratos vigentes (el historial cancelado se conserva)
CREATE UNIQUE INDEX contracts_one_active_per_lot ON contracts (lot_id) WHERE status <> 'CANCELADO';
CREATE INDEX contracts_client_idx ON contracts (client_id);
CREATE INDEX contracts_date_idx ON contracts (contract_date);

CREATE TABLE schedule_items (
  id           SERIAL PRIMARY KEY,
  contract_id  INTEGER NOT NULL REFERENCES contracts(id),
  kind         TEXT NOT NULL CHECK (kind IN ('APARTADO','ENGANCHE','MENSUAL')),
  number       INTEGER NOT NULL,
  due_date     DATE NOT NULL,
  amount       NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  status_override TEXT CHECK (status_override IN ('CANCELADA','REESTRUCTURADA')),
  UNIQUE (contract_id, kind, number)
);
CREATE INDEX schedule_items_due_idx ON schedule_items (due_date);

-- ---------- Aportaciones ----------
CREATE TABLE payments (
  id               SERIAL PRIMARY KEY,
  receipt_number   TEXT NOT NULL UNIQUE,
  idempotency_key  TEXT UNIQUE,
  contract_id      INTEGER NOT NULL REFERENCES contracts(id),
  effective_date   DATE NOT NULL,
  registered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  concept          TEXT NOT NULL CHECK (concept IN ('APARTADO','ENGANCHE','MENSUAL','EXTRAORDINARIO','MORATORIO','LIQUIDACION','AJUSTE')),
  scheduled_number INTEGER,
  capital          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (capital >= 0),
  interest         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (interest >= 0),
  total            NUMERIC(14,2) GENERATED ALWAYS AS (capital + interest) STORED,
  method           TEXT NOT NULL CHECK (method IN ('EFECTIVO','TRANSFERENCIA','DEPOSITO','CHEQUE','OTRO')),
  reference        TEXT,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'CONFIRMADA' CHECK (status IN ('CONFIRMADA','CANCELADA')),
  source           TEXT NOT NULL DEFAULT 'CAPTURA' CHECK (source IN ('CAPTURA','IMPORTACION')),
  user_id          INTEGER REFERENCES users(id),
  CHECK (capital + interest > 0)
);
CREATE INDEX payments_contract_idx ON payments (contract_id);
CREATE INDEX payments_date_idx ON payments (effective_date);

-- Distribución auditable del capital de cada aportación sobre las obligaciones del calendario
CREATE TABLE payment_applications (
  id                BIGSERIAL PRIMARY KEY,
  payment_id        INTEGER NOT NULL REFERENCES payments(id),
  schedule_item_id  INTEGER NOT NULL REFERENCES schedule_items(id),
  amount            NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_applications_payment_idx ON payment_applications (payment_id);
CREATE INDEX payment_applications_item_idx ON payment_applications (schedule_item_id);

CREATE TABLE payment_reversals (
  id          SERIAL PRIMARY KEY,
  payment_id  INTEGER NOT NULL UNIQUE REFERENCES payments(id),
  reason      TEXT NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No se permite borrar físicamente aportaciones
CREATE OR REPLACE FUNCTION forbid_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'OPERACION_PROHIBIDA: no se permite eliminar registros de %', TG_TABLE_NAME
    USING ERRCODE = 'P0011';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER contracts_no_delete BEFORE DELETE ON contracts FOR EACH ROW EXECUTE FUNCTION forbid_delete();

-- Una aportación confirmada sólo puede pasar a CANCELADA; sus importes no se editan
CREATE OR REPLACE FUNCTION payments_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'CANCELADA' THEN
    RAISE EXCEPTION 'OPERACION_PROHIBIDA: la aportación ya está cancelada' USING ERRCODE = 'P0011';
  END IF;
  IF NEW.capital <> OLD.capital OR NEW.interest <> OLD.interest OR NEW.contract_id <> OLD.contract_id
     OR NEW.effective_date <> OLD.effective_date OR NEW.receipt_number <> OLD.receipt_number THEN
    RAISE EXCEPTION 'OPERACION_PROHIBIDA: los importes de una aportación no se modifican; cancele y registre de nuevo'
      USING ERRCODE = 'P0011';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER payments_update_guard BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION payments_guard();

-- ---------- Documentos ----------
CREATE TABLE documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      INTEGER REFERENCES clients(id),
  contract_id    INTEGER REFERENCES contracts(id),
  doc_type       TEXT NOT NULL CHECK (doc_type IN ('CONSTANCIA_FISCAL','CONTRATO','IDENTIFICACION','OTRO')),
  original_name  TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  sha256         TEXT NOT NULL,
  storage_key    TEXT NOT NULL UNIQUE,
  uploaded_by    INTEGER REFERENCES users(id),
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at    TIMESTAMPTZ,
  CHECK (client_id IS NOT NULL OR contract_id IS NOT NULL)
);
CREATE INDEX documents_client_idx ON documents (client_id);
CREATE INDEX documents_contract_idx ON documents (contract_id);

-- ---------- Importaciones de contratos ----------
CREATE TABLE contract_imports (
  id           SERIAL PRIMARY KEY,
  filename     TEXT NOT NULL,
  file_sha256  TEXT NOT NULL,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at   TIMESTAMPTZ,
  status       TEXT NOT NULL CHECK (status IN ('VISTA_PREVIA','APLICADA','CANCELADA','ERROR')),
  payload      JSONB,
  summary      JSONB,
  errors       JSONB
);

-- ---------- Auditoría (inmutable) ----------
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     INTEGER REFERENCES users(id),
  username    TEXT,
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  before      JSONB,
  after       JSONB,
  reason      TEXT,
  ip          TEXT
);
CREATE INDEX audit_log_at_idx ON audit_log (at);
CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);
CREATE INDEX audit_log_user_idx ON audit_log (user_id);

CREATE OR REPLACE FUNCTION audit_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'OPERACION_PROHIBIDA: el historial de auditoría no puede modificarse ni eliminarse'
    USING ERRCODE = 'P0011';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log EXECUTE FUNCTION audit_immutable();
