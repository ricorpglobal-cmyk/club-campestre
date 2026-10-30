/**
 * Pruebas de extremo a extremo contra el servidor en ejecución (HTTP real).
 * Ejecutar con:  E2E_URL=http://localhost:3000 E2E_ADMIN_PASSWORD=... npx vitest run tests/http.test.ts
 * Cubre: login, credenciales incorrectas, permisos por rol en el backend, documentos fiscales,
 * persistencia tras cerrar sesión, origen cruzado y descarga de reportes.
 */
import { describe, it, expect, beforeAll } from 'vitest';
const BASE = process.env.E2E_URL;
const run = BASE ? describe : describe.skip;

class Agent {
  cookie = '';
  async req(path: string, opts: { method?: string; body?: any; form?: FormData; origin?: string } = {}) {
    const headers: Record<string, string> = { origin: opts.origin ?? BASE! };
    if (this.cookie) headers.cookie = this.cookie;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const r = await fetch(BASE + path, { method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'), headers, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined), redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    return r;
  }
  async json(path: string, opts: any = {}) { const r = await this.req(path, opts); return { status: r.status, data: await r.json().catch(() => null) }; }
}
const stamp = Date.now().toString(36);

run('HTTP: autenticación, permisos y persistencia', () => {
  const admin = new Agent(); const ventas = new Agent(); const cobranza = new Agent(); const anon = new Agent();
  let ventasPwd = ''; let cobPwd = ''; let clientId = 0;
  beforeAll(async () => {
    const r = await admin.json('/api/auth/login', { body: { username: process.env.E2E_ADMIN_USER ?? 'admin', password: process.env.E2E_ADMIN_PASSWORD } });
    expect(r.status).toBe(200);
  });
  it('rechaza credenciales incorrectas y no deja cookie de sesión', async () => {
    const a = new Agent(); const r = await a.json('/api/auth/login', { body: { username: 'admin', password: 'contrasenaMala123' } });
    expect(r.status).toBe(401); expect(a.cookie).toBe('');
  });
  it('sin sesión, la API responde 401 y las páginas redirigen a /login', async () => {
    expect((await anon.json('/api/clients')).status).toBe(401);
    const p = await anon.req('/clientes'); expect([302, 307]).toContain(p.status); expect(p.headers.get('location')).toContain('/login');
  });
  it('bloquea peticiones de otro origen (CSRF)', async () => {
    expect((await admin.json('/api/clients', { body: { full_name: 'X Y Z' }, origin: 'https://sitio-malicioso.com' })).status).toBe(403);
  });
  it('el administrador crea usuarios de Ventas y Cobranza', async () => {
    const v = await admin.json('/api/users', { body: { username: `ventas.${stamp}`, full_name: 'Usuario Ventas', role: 'VENTAS' } });
    const c = await admin.json('/api/users', { body: { username: `cobranza.${stamp}`, full_name: 'Usuario Cobranza', role: 'COBRANZA' } });
    expect(v.status).toBe(200); expect(c.status).toBe(200);
    ventasPwd = v.data.temporaryPassword; cobPwd = c.data.temporaryPassword;
    // primer acceso: debe cambiar la contraseña antes de usar el sistema
    await ventas.json('/api/auth/login', { body: { username: `ventas.${stamp}`, password: ventasPwd } });
    expect((await ventas.json('/api/clients')).status).toBe(403);
    expect((await ventas.json('/api/auth/password', { body: { current: ventasPwd, next: 'VentasNueva2026' } })).status).toBe(200);
    await cobranza.json('/api/auth/login', { body: { username: `cobranza.${stamp}`, password: cobPwd } });
    expect((await cobranza.json('/api/auth/password', { body: { current: cobPwd, next: 'CobranzaNueva2026' } })).status).toBe(200);
  });
  it('Ventas no puede registrar aportaciones, administrar usuarios ni importar precios (verificado en el backend)', async () => {
    expect((await ventas.json('/api/payments', { body: { contract_id: 1, effective_date: '2026-01-01', concept: 'MENSUAL', capital: 1, method: 'EFECTIVO' } })).status).toBe(403);
    expect((await ventas.json('/api/users', { body: { username: 'hack', full_name: 'Hack', role: 'ADMINISTRADOR' } })).status).toBe(403);
    expect((await ventas.json('/api/price-import', { form: new FormData() })).status).toBe(403);
    expect((await ventas.json('/api/reports/cobranza_dia')).status).toBe(403);
    expect((await ventas.req('/api/reports/ventas_mes')).status).toBe(200);
    const me = await admin.json('/api/users'); const vid = me.data.users.find((u: any) => u.username === `ventas.${stamp}`).id;
    expect((await ventas.json(`/api/users/${vid}`, { method: 'PATCH', body: { role: 'ADMINISTRADOR' } })).status).toBe(403);
  });
  it('Cobranza no puede crear contratos ni clientes', async () => {
    expect((await cobranza.json('/api/contracts', { body: {} })).status).toBe(403);
    expect((await cobranza.json('/api/clients', { body: { full_name: 'Cliente X' } })).status).toBe(403);
    expect((await cobranza.req('/api/reports/cobranza_dia')).status).toBe(200);
  });
  it('la información fiscal y la constancia sólo son visibles con permiso', async () => {
    const c = await ventas.json('/api/clients', { body: { full_name: `Cliente Fiscal ${stamp}`, rfc: 'XAXX010101000', phone: '4620000000' } });
    expect(c.status).toBe(200); expect(c.data.client.rfc).toBeNull();     // Ventas no puede capturar RFC
    clientId = c.data.client.id;
    await admin.json(`/api/clients/${clientId}`, { method: 'PATCH', body: { full_name: `Cliente Fiscal ${stamp}`, rfc: 'XAXX010101000' } });
    const fd = new FormData(); fd.append('doc_type', 'CONSTANCIA_FISCAL');
    fd.append('file', new Blob([Buffer.from('%PDF-1.4\n% constancia de prueba\n%%EOF')], { type: 'application/pdf' }), 'csf.pdf');
    const up = await admin.json(`/api/clients/${clientId}/documents`, { form: fd }); expect(up.status).toBe(200);
    const bad = new FormData(); bad.append('doc_type', 'OTRO'); bad.append('file', new Blob(['<script>alert(1)</script>']), 'x.pdf');
    expect((await admin.json(`/api/clients/${clientId}/documents`, { form: bad })).status).toBe(400);
    expect((await admin.req(`/api/documents/${up.data.id}`)).status).toBe(200);
    expect((await ventas.req(`/api/documents/${up.data.id}`)).status).toBe(403);
    expect((await anon.req(`/api/documents/${up.data.id}`)).status).toBe(401);
    const list = await ventas.json(`/api/clients?q=${encodeURIComponent('Cliente Fiscal ' + stamp)}`);
    expect(list.data.clients[0].rfc).toBe('••••••••••');
    const adminList = await admin.json(`/api/clients?q=${encodeURIComponent('Cliente Fiscal ' + stamp)}`);
    expect(adminList.data.clients[0].rfc).toBe('XAXX010101000');
  });
  it('los datos persisten después de cerrar sesión', async () => {
    expect((await admin.json('/api/auth/logout', { method: 'POST' })).status).toBe(200);
    expect((await admin.json('/api/clients')).status).toBe(401);
    await admin.json('/api/auth/login', { body: { username: process.env.E2E_ADMIN_USER ?? 'admin', password: process.env.E2E_ADMIN_PASSWORD } });
    const r = await admin.json(`/api/clients?q=${encodeURIComponent('Cliente Fiscal ' + stamp)}`);
    expect(r.data.clients.length).toBe(1);
  });
  it('descarga reportes .xlsx con nombre descriptivo', async () => {
    const r = await admin.req('/api/reports/cartera_vencida');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toMatch(/Cartera_Vencida_\d{4}-\d{2}-\d{2}\.xlsx/);
    const buf = Buffer.from(await r.arrayBuffer()); expect(buf.subarray(0, 2).toString()).toBe('PK');
  });
  it('limpieza: desactiva los usuarios de prueba', async () => {
    const me = await admin.json('/api/users');
    for (const u of me.data.users.filter((u: any) => u.username.endsWith(stamp))) expect((await admin.json(`/api/users/${u.id}`, { method: 'PATCH', body: { is_active: false } })).status).toBe(200);
  });
});
