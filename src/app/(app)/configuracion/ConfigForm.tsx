'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, Alert } from '@/components/client';

const FIELDS: [string, string, 'text' | 'number' | 'bool' | 'select', string?, string[][]?][] = [
  ['nombre_proyecto', 'Nombre del proyecto (aparece en reportes)', 'text'],
  ['zona_horaria', 'Zona horaria', 'select', 'Define el "hoy" para vencimientos y reportes', [['America/Mexico_City', 'Centro (CDMX, Guanajuato)'], ['America/Monterrey', 'Monterrey'], ['America/Cancun', 'Quintana Roo'], ['America/Chihuahua', 'Chihuahua'], ['America/Mazatlan', 'Pacífico'], ['America/Tijuana', 'Noroeste (Tijuana)']]],
  ['modo_apartado', 'Tratamiento del apartado (predeterminado)', 'select', 'Se puede cambiar en cada contrato', [['PRECIO', 'Abono al precio total (reduce el saldo financiado)'], ['ENGANCHE', 'Parte del enganche']]],
  ['dias_proximo_vencer', 'Días para considerar "próximo a vencer"', 'number'],
  ['dias_gracia_atraso', 'Días de gracia antes de considerar "atrasado"', 'number'],
  ['moratorios_activos', 'Cobrar interés moratorio', 'bool', 'La lista vigente indica que el financiamiento no incluye intereses'],
  ['tasa_moratoria_mensual', 'Tasa moratoria mensual (%)', 'number'],
  ['permitir_excepciones', 'Permitir contratos con condiciones especiales', 'bool'],
  ['prefijo_contrato', 'Prefijo de folio de contrato', 'text'], ['prefijo_recibo', 'Prefijo de folio de recibo', 'text'], ['prefijo_cliente', 'Prefijo de ID de cliente', 'text'],
  ['max_intentos_login', 'Intentos fallidos antes de bloquear', 'number'], ['minutos_bloqueo_login', 'Minutos de bloqueo', 'number'], ['horas_sesion', 'Duración de la sesión (horas)', 'number'],
];
export function ConfigForm({ cfg, env }: { cfg: any; env: any }) {
  const router = useRouter(); const [v, setV] = useState<any>(cfg); const [msg, setMsg] = useState<any>(null);
  const save = async () => { setMsg(null); try { await apiFetch('/api/config', { method: 'PATCH', body: v }); setMsg({ k: 'success', t: 'Configuración guardada.' }); router.refresh(); } catch (e: any) { setMsg({ k: 'error', t: e.message }); } };
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="card p-5 lg:col-span-2">
        {msg && <Alert kind={msg.k}>{msg.t}</Alert>}
        <div className="grid gap-4 md:grid-cols-2">{FIELDS.map(([k, l, t, h, opts]) => <div key={k}>
          {t === 'bool' ? <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={!!v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />{l}</label> : <>
            <label className="label">{l}</label>
            {t === 'select' ? <select className="input" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })}>{opts!.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
              : <input className="input" type={t} value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: t === 'number' ? Number(e.target.value) : e.target.value })} />}</>}
          {h && <div className="mt-1 text-[11px] muted">{h}</div>}</div>)}</div>
        <button className="btn-primary mt-5" onClick={save}>Guardar configuración</button>
      </section>
      <section className="card h-fit p-5 text-sm">
        <h2 className="mb-3">Servicios del servidor</h2>
        <ul className="space-y-2"><li>Almacenamiento de documentos: <b>{env.storage === 's3' ? 'S3 / R2 (privado)' : 'Carpeta privada del servidor'}</b></li>
          <li>Correo de recuperación: <b>{env.mail ? 'Configurado' : 'No configurado'}</b>{!env.mail && <div className="text-xs muted">El administrador genera enlaces de restablecimiento desde Usuarios.</div>}</li>
          <li>URL pública: <b>{env.appUrl || '—'}</b></li></ul>
        <p className="mt-3 text-xs muted">Estos valores se definen en las variables de entorno del servidor (ver README), no desde la interfaz.</p>
      </section>
    </div>
  );
}
