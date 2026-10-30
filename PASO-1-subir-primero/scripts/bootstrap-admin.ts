/**
 * Arranque en servidor: si la base no tiene NINGÚN usuario y existen ADMIN_USERNAME y ADMIN_PASSWORD,
 * crea el primer administrador con contraseña temporal (obligatorio cambiarla al entrar).
 * Nunca modifica usuarios existentes; si ya hay usuarios, no hace nada.
 */
import 'dotenv/config';
import { Client } from 'pg';
import { hashPassword, passwordProblem } from '../src/lib/crypto';

async function main() {
  const u = process.env.ADMIN_USERNAME?.trim().toLowerCase(); const p = process.env.ADMIN_PASSWORD;
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const n = (await db.query('SELECT count(*)::int n FROM users')).rows[0].n;
  if (n > 0) { console.log('Usuarios existentes: no se crea administrador inicial.'); return db.end(); }
  if (!u || !p) { console.log('AVISO: no hay usuarios. Defina ADMIN_USERNAME y ADMIN_PASSWORD o ejecute npm run create-admin.'); return db.end(); }
  if (!/^[a-z0-9._-]{3,40}$/.test(u)) throw new Error('ADMIN_USERNAME inválido (3 a 40 caracteres: letras, números, punto o guion).');
  const prob = passwordProblem(p); if (prob) throw new Error('ADMIN_PASSWORD: ' + prob);
  await db.query('BEGIN');
  const r = await db.query(`INSERT INTO users(username, full_name, email, password_hash, role, must_change_password) VALUES ($1,$2,$3,$4,'ADMINISTRADOR',true) RETURNING id`,
    [u, process.env.ADMIN_FULL_NAME?.trim() || 'Administrador', process.env.ADMIN_EMAIL?.trim() || null, await hashPassword(p)]);
  await db.query(`INSERT INTO audit_log(user_id, username, action, entity, entity_id, after) VALUES ($1,$2,'ALTA_ADMINISTRADOR_INICIAL','usuario',$3,$4)`, [r.rows[0].id, u, String(r.rows[0].id), JSON.stringify({ username: u })]);
  await db.query('COMMIT');
  console.log(`Administrador inicial "${u}" creado. Deberá cambiar su contraseña en el primer acceso.`);
  await db.end();
}
main().catch((e) => { console.error('Error al crear el administrador inicial:', e.message); process.exit(1); });
