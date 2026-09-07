import type { Env } from './env';
import { HttpError } from './util';

export const COOKIE = 'ec_admin';
const SESSION_DAYS = 7;
const enc = new TextEncoder();

async function key(env: Env): Promise<CryptoKey> {
  if (!env.ADMIN_PASSWORD) throw new HttpError(503, 'Admin password is not configured. Run: wrangler secret put ADMIN_PASSWORD');
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(env.ADMIN_PASSWORD + '|el-compita-session-v1'));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** Constant-time comparison of two equal-length hex strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(env: Env, candidate: string): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) throw new HttpError(503, 'Admin password is not configured. Run: wrangler secret put ADMIN_PASSWORD');
  const [a, b] = await Promise.all([sha256Hex(candidate), sha256Hex(env.ADMIN_PASSWORD)]);
  return safeEqual(a, b);
}

export async function issueSessionCookie(env: Env, secure: boolean): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const sig = hex(await crypto.subtle.sign('HMAC', await key(env), enc.encode(String(exp))));
  const token = `${exp}.${sig}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export async function isAuthed(env: Env, req: Request): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false;
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [expStr, sig] = (m[1] ?? '').split('.');
  if (!expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = hex(await crypto.subtle.sign('HMAC', await key(env), enc.encode(expStr)));
  return safeEqual(sig, expected);
}

export async function requireAuth(env: Env, req: Request): Promise<void> {
  if (!(await isAuthed(env, req))) throw new HttpError(401, 'Please sign in.');
}
