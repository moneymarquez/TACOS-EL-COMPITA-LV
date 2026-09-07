/** HTML-escape untrusted text for insertion into markup or attributes. */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function bad(message: string): never {
  throw new HttpError(400, message);
}

/** Today's date as YYYY-MM-DD in the site's timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Current time as HH:MM (24h) in the site's timezone. */
export function nowHHMMIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** "17:30" -> "5:30 PM", "11:00" -> "11 AM" */
export function fmtTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr), m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "2026-09-07" -> "Mon, Sep 7" with Today/Tomorrow labels relative to `today`. */
export function fmtDateLabel(iso: string, today: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  const t = new Date(today + 'T12:00:00Z');
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  const pretty = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
  if (diff === 0) return `Today · ${pretty}`;
  if (diff === 1) return `Tomorrow · ${pretty}`;
  return pretty;
}

export function fmtPrice(cents: number | null): string | null {
  if (cents === null || cents === undefined) return null;
  const dollars = cents / 100;
  return cents % 100 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

/** "3", "3.5", "$3.50" -> 350 cents; "" -> null; garbage -> NaN */
export function parsePriceToCents(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/^\$/, '');
  if (s === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return Number.NaN;
  return Math.round(Number(s) * 100);
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Google Maps directions deep link. Works on iOS/Android/desktop with no API key. */
export function directionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export function str(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function digitsOnly(s: string): string {
  return s.replace(/[^\d+]/g, '');
}
