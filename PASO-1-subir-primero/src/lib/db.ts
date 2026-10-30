import { Pool, PoolClient, types } from 'pg';

// DATE como texto 'YYYY-MM-DD' (sin conversiones de zona horaria); BIGINT como número.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(20, (v) => Number(v));

const g = globalThis as unknown as { __ccPool?: Pool };

export function pool(): Pool {
  if (!g.__ccPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL no está configurada');
    g.__ccPool = new Pool({ connectionString: url, max: 10 });
  }
  return g.__ccPool;
}

export type Db = Pool | PoolClient;

export async function q<T = any>(sql: string, params: unknown[] = [], db: Db = pool()): Promise<T[]> {
  const r = await db.query(sql, params as any[]);
  return r.rows as T[];
}

export async function one<T = any>(sql: string, params: unknown[] = [], db: Db = pool()): Promise<T | null> {
  const rows = await q<T>(sql, params, db);
  return rows[0] ?? null;
}

/** Ejecuta fn dentro de una transacción; ante cualquier error hace ROLLBACK completo. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
