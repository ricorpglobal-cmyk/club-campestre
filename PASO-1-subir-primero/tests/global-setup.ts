import { readdirSync, readFileSync } from 'node:fs';
import { Client } from 'pg';
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5432/club_campestre_test';
  if (!/_test\b/.test(url)) throw new Error('Las pruebas sólo corren contra una base cuyo nombre termina en _test');
  const c = new Client({ connectionString: url }); await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const f of readdirSync('migrations').sort()) await c.query(readFileSync(`migrations/${f}`, 'utf8'));
  await c.end();
}
