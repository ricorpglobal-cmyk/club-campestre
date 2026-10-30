import { z } from 'zod';
import { api } from '@/lib/api';
import { tx, q } from '@/lib/db';
import { getConfig } from '@/lib/config';
import { audit } from '@/lib/audit';
const schema = z.object({
  nombre_proyecto: z.string().trim().min(3).max(120), zona_horaria: z.string().regex(/^America\/[A-Za-z_]+$/), modo_apartado: z.enum(['PRECIO', 'ENGANCHE']),
  dias_proximo_vencer: z.number().int().min(0).max(60), dias_gracia_atraso: z.number().int().min(0).max(90), moratorios_activos: z.boolean(), tasa_moratoria_mensual: z.number().min(0).max(20),
  permitir_excepciones: z.boolean(), prefijo_contrato: z.string().regex(/^[A-Z0-9]{1,8}$/i), prefijo_recibo: z.string().regex(/^[A-Z0-9]{1,8}$/i), prefijo_cliente: z.string().regex(/^[A-Z0-9]{1,8}$/i),
  max_intentos_login: z.number().int().min(3).max(20), minutos_bloqueo_login: z.number().int().min(1).max(1440), horas_sesion: z.number().int().min(1).max(72),
});
export const PATCH = api({ perm: 'config.editar' }, async ({ req, user, ip }) => {
  const b = schema.parse(await req.json()); const before = await getConfig();
  await tx(async (c) => {
    const changed: Record<string, unknown> = {}; const prev: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(b)) if (JSON.stringify((before as any)[k]) !== JSON.stringify(v)) { changed[k] = v; prev[k] = (before as any)[k]; await q('UPDATE system_config SET value=$2, updated_at=now(), updated_by=$3 WHERE key=$1', [k, JSON.stringify(v), user.id], c); }
    if (Object.keys(changed).length) await audit(c, user, 'CAMBIO_CONFIGURACION', { entity: 'configuracion', before: prev, after: changed, ip });
  });
  return { ok: true };
});
