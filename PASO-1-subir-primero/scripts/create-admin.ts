/**
 * Crea el PRIMER administrador de forma segura (desde la consola del servidor, nunca desde la web).
 * Uso:  npm run create-admin
 * La contraseña se pide en la consola sin mostrarse y se guarda con hash argon2.
 */
import 'dotenv/config';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { Client } from 'pg';
import { hashPassword, passwordProblem } from '../src/lib/crypto';

function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const out = new Writable({ write(chunk, enc, cb) { if (!muted) process.stdout.write(chunk, enc as BufferEncoding); cb(); } });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((res) => { rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); res(a.trim()); }); muted = hidden; });
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const admins = await db.query(`SELECT count(*)::int n FROM users WHERE role='ADMINISTRADOR' AND is_active`);
  if (admins.rows[0].n > 0 && !process.argv.includes('--force')) {
    console.log('Ya existe un administrador activo. Cree usuarios desde el sistema (o use --force para agregar otro desde consola).');
    process.exit(1);
  }
  const username = (process.env.ADMIN_USERNAME || await ask('Usuario del administrador: ')).toLowerCase();
  const full_name = process.env.ADMIN_FULL_NAME || await ask('Nombre completo: ');
  const email = process.env.ADMIN_EMAIL || await ask('Correo (opcional): ');
  const password = process.env.ADMIN_PASSWORD || await ask('Contraseña (mín. 10, letras y números): ', true);
  if (!process.env.ADMIN_PASSWORD) { const again = await ask('Confirme la contraseña: ', true); if (again !== password) throw new Error('Las contraseñas no coinciden.'); }
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error('Usuario inválido.');
  const prob = passwordProblem(password); if (prob) throw new Error(prob);
  const h = await hashPassword(password);
  await db.query('BEGIN');
  const r = await db.query(`INSERT INTO users(username, full_name, email, password_hash, role) VALUES ($1,$2,$3,$4,'ADMINISTRADOR') RETURNING id`, [username, full_name, email || null, h]);
  await db.query(`INSERT INTO audit_log(user_id, username, action, entity, entity_id, after) VALUES ($1,$2,'ALTA_ADMINISTRADOR_CONSOLA','usuario',$3,$4)`, [r.rows[0].id, username, String(r.rows[0].id), JSON.stringify({ username })]);
  await db.query('COMMIT');
  console.log(`Administrador "${username}" creado. Ya puede iniciar sesión.`);
  await db.end();
}
main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
