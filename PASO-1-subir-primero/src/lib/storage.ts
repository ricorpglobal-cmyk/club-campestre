import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

/** Almacenamiento privado: nunca se sirve directamente; sólo a través de endpoints con permisos. */
const driver = () => (process.env.STORAGE_DRIVER || 'local').toLowerCase();
const localDir = () => resolve(process.env.STORAGE_LOCAL_DIR || './storage');
let s3: S3Client | null = null;
const s3c = () => (s3 ??= new S3Client({
  region: process.env.S3_REGION || 'auto', endpoint: process.env.S3_ENDPOINT || undefined,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID || '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '' },
  forcePathStyle: !!process.env.S3_ENDPOINT,
}));

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (!/^[a-z0-9/_\-.]+$/i.test(key) || key.includes('..')) throw new Error('Clave de almacenamiento inválida');
  if (driver() === 's3') {
    await s3c().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: process.env.S3_ENDPOINT ? undefined : 'AES256' }));
    return;
  }
  const p = join(localDir(), key);
  await mkdir(join(p, '..'), { recursive: true });
  await writeFile(p, body, { mode: 0o600 });
}

export async function getObject(key: string): Promise<Buffer> {
  if (driver() === 's3') {
    const r = await s3c().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  const p = resolve(localDir(), key);
  if (!p.startsWith(localDir())) throw new Error('Ruta inválida');
  return readFile(p);
}

/** Detecta el tipo real por la firma del archivo (no se confía en la extensión). */
export function sniffMime(buf: Buffer): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}
