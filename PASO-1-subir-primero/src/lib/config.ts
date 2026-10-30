import { q, Db, pool } from './db';

export type SystemConfig = {
  nombre_proyecto: string;
  zona_horaria: string;
  modo_apartado: 'PRECIO' | 'ENGANCHE';
  dias_proximo_vencer: number;
  dias_gracia_atraso: number;
  moratorios_activos: boolean;
  tasa_moratoria_mensual: number;
  prefijo_contrato: string;
  prefijo_recibo: string;
  prefijo_cliente: string;
  permitir_excepciones: boolean;
  max_intentos_login: number;
  minutos_bloqueo_login: number;
  horas_sesion: number;
};

export async function getConfig(db: Db = pool()): Promise<SystemConfig> {
  const rows = await q<{ key: string; value: any }>('SELECT key, value FROM system_config', [], db);
  const o: any = {};
  for (const r of rows) o[r.key] = r.value;
  return o as SystemConfig;
}

/** Folio consecutivo por año, seguro ante concurrencia. */
export async function nextFolio(db: Db, name: string, prefix: string, year: number, pad = 4): Promise<string> {
  const r = await q<{ value: number }>(
    `INSERT INTO counters(name, year, value) VALUES ($1,$2,1)
     ON CONFLICT (name, year) DO UPDATE SET value = counters.value + 1 RETURNING value`, [name, year], db);
  return `${prefix}-${year}-${String(r[0].value).padStart(pad, '0')}`;
}
