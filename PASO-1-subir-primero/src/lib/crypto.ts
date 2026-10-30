import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const hashPassword = (p: string) => hash(p, ARGON);
export const verifyPassword = async (h: string, p: string) => { try { return await verify(h, p); } catch { return false; } };
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

/** Política: mínimo 10 caracteres, con letras y números. */
export function passwordProblem(p: string): string | null {
  if (typeof p !== 'string' || p.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (p.length > 200) return 'La contraseña es demasiado larga.';
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(p) || !/\d/.test(p)) return 'La contraseña debe incluir letras y números.';
  return null;
}
