import type { Env } from '../env';
import type { Inquiry, MenuCategory, MenuItem, Photo, Review, ScheduleEntry, Truck } from '../db';
import { SETTING_KEYS, loadSettings } from '../db';
import { checkPassword, clearSessionCookie, issueSessionCookie, requireAuth } from '../auth';
import { HttpError, bad, isHHMM, isHttpUrl, isIsoDate, json, parsePriceToCents, str, todayIn } from '../util';

type Params = Record<string, string>;
type Handler = (req: Request, env: Env, p: Params) => Promise<Response>;
interface Route { method: string; pattern: RegExp; keys: string[]; handler: Handler; public?: boolean }

const routes: Route[] = [];
function route(method: string, path: string, handler: Handler, opts: { public?: boolean } = {}) {
  const keys: string[] = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k: string) => { keys.push(k); return '(\\d+)'; }) + '$');
  routes.push({ method, pattern: re, keys, handler, ...opts });
}

async function body(req: Request): Promise<Record<string, unknown>> {
  const v = await req.json().catch(() => null);
  if (!v || typeof v !== 'object' || Array.isArray(v)) bad('Expected a JSON object.');
  return v as Record<string, unknown>;
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/* ── auth ─────────────────────────────────────────────────────────── */
route('POST', '/login', async (req, env) => {
  const b = await body(req);
  const ok = await checkPassword(env, str(b.password, 500));
  if (!ok) throw new HttpError(401, 'Wrong password.');
  const secure = new URL(req.url).protocol === 'https:';
  return json({ ok: true }, 200, { 'set-cookie': await issueSessionCookie(env, secure) });
}, { public: true });

route('POST', '/logout', async () => json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() }), { public: true });

route('GET', '/me', async (_req, env) => json({
  ok: true,
  emailConfigured: Boolean(env.RESEND_API_KEY),
  today: todayIn(env.SITE_TIMEZONE),
  siteUrl: env.SITE_URL,
}));

/* ── trucks ───────────────────────────────────────────────────────── */
route('GET', '/trucks', async (_req, env) => json((await env.DB.prepare('SELECT * FROM trucks ORDER BY sort_order, id').all<Truck>()).results));
route('PUT', '/trucks/:id', async (req, env, p) => {
  const b = await body(req);
  const label = str(b.label, 60);
  if (!label) bad('Truck label is required.');
  const active = b.active ? 1 : 0;
  await env.DB.prepare('UPDATE trucks SET label = ?1, active = ?2 WHERE id = ?3').bind(label, active, Number(p.id)).run();
  return json({ ok: true });
});

/* ── schedule ─────────────────────────────────────────────────────── */
function scheduleInput(b: Record<string, unknown>) {
  const truck_id = Number(b.truck_id);
  const date = str(b.date, 10), start_time = str(b.start_time, 5), end_time = str(b.end_time, 5);
  const location_name = str(b.location_name, 120), street_address = str(b.street_address, 200);
  const map_link = str(b.map_link, 500), note = str(b.note, 300);
  if (!Number.isInteger(truck_id)) bad('Pick a truck.');
  if (!isIsoDate(date)) bad('Date must be YYYY-MM-DD.');
  if (!isHHMM(start_time) || !isHHMM(end_time)) bad('Times must be HH:MM (24-hour).');
  if (end_time <= start_time) bad('End time must be after start time.');
  if (!location_name) bad('Location name is required.');
  if (map_link && !isHttpUrl(map_link)) bad('Map link must be a full https:// URL.');
  return { truck_id, date, start_time, end_time, location_name, street_address, map_link, note };
}
route('GET', '/schedule', async (_req, env) => {
  const r = await env.DB.prepare('SELECT * FROM schedule_entries ORDER BY date DESC, start_time DESC, id DESC LIMIT 400').all<ScheduleEntry>();
  return json(r.results);
});
route('POST', '/schedule', async (req, env) => {
  const s = scheduleInput(await body(req));
  const row = await env.DB.prepare(
    `INSERT INTO schedule_entries (truck_id, date, start_time, end_time, location_name, street_address, map_link, note)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8) RETURNING *`,
  ).bind(s.truck_id, s.date, s.start_time, s.end_time, s.location_name, s.street_address, s.map_link, s.note).first<ScheduleEntry>();
  return json(row, 201);
});
route('PUT', '/schedule/:id', async (req, env, p) => {
  const s = scheduleInput(await body(req));
  const r = await env.DB.prepare(
    `UPDATE schedule_entries SET truck_id=?1, date=?2, start_time=?3, end_time=?4, location_name=?5, street_address=?6, map_link=?7, note=?8 WHERE id=?9`,
  ).bind(s.truck_id, s.date, s.start_time, s.end_time, s.location_name, s.street_address, s.map_link, s.note, Number(p.id)).run();
  if (!r.meta.changes) throw new HttpError(404, 'Schedule entry not found.');
  return json({ ok: true });
});
route('DELETE', '/schedule/:id', async (_req, env, p) => {
  await env.DB.prepare('DELETE FROM schedule_entries WHERE id = ?1').bind(Number(p.id)).run();
  return json({ ok: true });
});
route('POST', '/schedule/clear-past', async (_req, env) => {
  const r = await env.DB.prepare('DELETE FROM schedule_entries WHERE date < ?1').bind(todayIn(env.SITE_TIMEZONE)).run();
  return json({ ok: true, deleted: r.meta.changes });
});

/* ── menu ─────────────────────────────────────────────────────────── */
route('GET', '/menu', async (_req, env) => {
  const [c, i] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM menu_categories ORDER BY sort_order, id'),
    env.DB.prepare('SELECT * FROM menu_items ORDER BY sort_order, id'),
  ]);
  return json({ categories: (c?.results ?? []) as MenuCategory[], items: (i?.results ?? []) as MenuItem[] });
});
route('POST', '/menu/categories', async (req, env) => {
  const name = str((await body(req)).name, 60);
  if (!name) bad('Category name is required.');
  const row = await env.DB.prepare(
    'INSERT INTO menu_categories (name, sort_order) VALUES (?1, (SELECT COALESCE(MAX(sort_order),0)+1 FROM menu_categories)) RETURNING *',
  ).bind(name).first<MenuCategory>();
  return json(row, 201);
});
route('PUT', '/menu/categories/:id', async (req, env, p) => {
  const name = str((await body(req)).name, 60);
  if (!name) bad('Category name is required.');
  await env.DB.prepare('UPDATE menu_categories SET name = ?1 WHERE id = ?2').bind(name, Number(p.id)).run();
  return json({ ok: true });
});
route('DELETE', '/menu/categories/:id', async (_req, env, p) => {
  const id = Number(p.id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM menu_items WHERE category_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM menu_categories WHERE id = ?1').bind(id),
  ]);
  return json({ ok: true });
});
route('POST', '/menu/categories/reorder', async (req, env) => reorder(env, 'menu_categories', await body(req)));

function itemInput(b: Record<string, unknown>) {
  const category_id = Number(b.category_id);
  const name = str(b.name, 80), description = str(b.description, 300);
  const price_cents = parsePriceToCents(b.price);
  const availability = str(b.availability, 20) || 'available';
  if (!Number.isInteger(category_id)) bad('Pick a category.');
  if (!name) bad('Item name is required.');
  if (Number.isNaN(price_cents)) bad('Price must look like 3 or 3.50 (leave blank if not set yet).');
  if (!['available', 'sold_out', 'hidden'].includes(availability)) bad('Bad availability value.');
  return { category_id, name, description, price_cents, availability };
}
route('POST', '/menu/items', async (req, env) => {
  const i = itemInput(await body(req));
  const row = await env.DB.prepare(
    `INSERT INTO menu_items (category_id, name, description, price_cents, availability, sort_order)
     VALUES (?1,?2,?3,?4,?5,(SELECT COALESCE(MAX(sort_order),0)+1 FROM menu_items)) RETURNING *`,
  ).bind(i.category_id, i.name, i.description, i.price_cents, i.availability).first<MenuItem>();
  return json(row, 201);
});
route('PUT', '/menu/items/:id', async (req, env, p) => {
  const i = itemInput(await body(req));
  const r = await env.DB.prepare(
    'UPDATE menu_items SET category_id=?1, name=?2, description=?3, price_cents=?4, availability=?5 WHERE id=?6',
  ).bind(i.category_id, i.name, i.description, i.price_cents, i.availability, Number(p.id)).run();
  if (!r.meta.changes) throw new HttpError(404, 'Menu item not found.');
  return json({ ok: true });
});
route('DELETE', '/menu/items/:id', async (_req, env, p) => {
  await env.DB.prepare('DELETE FROM menu_items WHERE id = ?1').bind(Number(p.id)).run();
  return json({ ok: true });
});
route('POST', '/menu/items/reorder', async (req, env) => reorder(env, 'menu_items', await body(req)));

/** { ids: [3, 1, 2] } -> sort_order 0,1,2 in that order. Table name is internal, never user input. */
async function reorder(env: Env, table: 'menu_items' | 'menu_categories' | 'photos' | 'reviews', b: Record<string, unknown>): Promise<Response> {
  const ids = Array.isArray(b.ids) ? b.ids.map(Number) : [];
  if (!ids.length || ids.some((n) => !Number.isInteger(n))) bad('ids must be a list of numbers.');
  await env.DB.batch(ids.map((id, idx) => env.DB.prepare(`UPDATE ${table} SET sort_order = ?1 WHERE id = ?2`).bind(idx, id)));
  return json({ ok: true });
}

/* ── photos (R2) ──────────────────────────────────────────────────── */
route('GET', '/photos', async (_req, env) => json((await env.DB.prepare('SELECT * FROM photos ORDER BY sort_order, id').all<Photo>()).results));
route('POST', '/photos', async (req, env) => {
  const fd = await req.formData().catch(() => null);
  if (!fd) bad('Expected multipart form data.');
  const file = fd.get('file');
  if (!(file instanceof File)) bad('Choose an image file.');
  const ext = PHOTO_TYPES[file.type];
  if (!ext) bad('Photos must be JPG, PNG, or WebP.');
  if (file.size > MAX_PHOTO_BYTES) bad('Photo is over 8 MB. Please use a smaller image.');
  const alt_text = str(fd.get('alt_text'), 200);
  if (!alt_text) bad('Add a short description of the photo (used for accessibility and search).');
  const width = Number(fd.get('width')) || null, height = Number(fd.get('height')) || null;
  const r2_key = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await env.PHOTOS.put(r2_key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const row = await env.DB.prepare(
    `INSERT INTO photos (r2_key, content_type, alt_text, width, height, sort_order)
     VALUES (?1,?2,?3,?4,?5,(SELECT COALESCE(MAX(sort_order),0)+1 FROM photos)) RETURNING *`,
  ).bind(r2_key, file.type, alt_text, width, height).first<Photo>();
  return json(row, 201);
});
route('PUT', '/photos/:id', async (req, env, p) => {
  const alt_text = str((await body(req)).alt_text, 200);
  if (!alt_text) bad('Description is required.');
  await env.DB.prepare('UPDATE photos SET alt_text = ?1 WHERE id = ?2').bind(alt_text, Number(p.id)).run();
  return json({ ok: true });
});
route('DELETE', '/photos/:id', async (_req, env, p) => {
  const row = await env.DB.prepare('SELECT r2_key FROM photos WHERE id = ?1').bind(Number(p.id)).first<{ r2_key: string }>();
  if (row) {
    await env.PHOTOS.delete(row.r2_key);
    await env.DB.prepare('DELETE FROM photos WHERE id = ?1').bind(Number(p.id)).run();
  }
  return json({ ok: true });
});
route('POST', '/photos/reorder', async (req, env) => reorder(env, 'photos', await body(req)));

/* ── reviews ──────────────────────────────────────────────────────── */
function reviewInput(b: Record<string, unknown>) {
  const reviewer_name = str(b.reviewer_name, 80), quote = str(b.quote, 600), source = str(b.source, 40) || 'Google';
  const star_rating = Number(b.star_rating);
  if (!reviewer_name) bad('Reviewer name is required.');
  if (!quote) bad('Quote is required.');
  if (!Number.isInteger(star_rating) || star_rating < 1 || star_rating > 5) bad('Stars must be 1-5.');
  return { reviewer_name, quote, star_rating, source };
}
route('GET', '/reviews', async (_req, env) => json((await env.DB.prepare('SELECT * FROM reviews ORDER BY sort_order, id').all<Review>()).results));
route('POST', '/reviews', async (req, env) => {
  const r = reviewInput(await body(req));
  const row = await env.DB.prepare(
    `INSERT INTO reviews (reviewer_name, quote, star_rating, source, sort_order)
     VALUES (?1,?2,?3,?4,(SELECT COALESCE(MAX(sort_order),0)+1 FROM reviews)) RETURNING *`,
  ).bind(r.reviewer_name, r.quote, r.star_rating, r.source).first<Review>();
  return json(row, 201);
});
route('PUT', '/reviews/:id', async (req, env, p) => {
  const r = reviewInput(await body(req));
  await env.DB.prepare('UPDATE reviews SET reviewer_name=?1, quote=?2, star_rating=?3, source=?4 WHERE id=?5')
    .bind(r.reviewer_name, r.quote, r.star_rating, r.source, Number(p.id)).run();
  return json({ ok: true });
});
route('DELETE', '/reviews/:id', async (_req, env, p) => {
  await env.DB.prepare('DELETE FROM reviews WHERE id = ?1').bind(Number(p.id)).run();
  return json({ ok: true });
});
route('POST', '/reviews/reorder', async (req, env) => reorder(env, 'reviews', await body(req)));

/* ── settings (hero, story, catering copy, contact, rating, notify email) ── */
route('GET', '/settings', async (_req, env) => json(await loadSettings(env)));
route('PUT', '/settings', async (req, env) => {
  const b = await body(req);
  const stmts: D1PreparedStatement[] = [];
  for (const key of SETTING_KEYS) {
    if (!(key in b)) continue;
    const value = str(b[key], 5000);
    if (key === 'instagram_url' && value && !isHttpUrl(value)) bad('Instagram link must be a full https:// URL.');
    if (key === 'google_reviews_url' && value && !isHttpUrl(value)) bad('Google reviews link must be a full https:// URL.');
    if (key === 'google_rating' && value && !(/^\d(\.\d)?$/.test(value) && Number(value) <= 5)) bad('Google rating must look like 4.8.');
    if (key === 'google_review_count' && value && !/^\d+$/.test(value)) bad('Review count must be a whole number.');
    if ((key === 'email' || key === 'notify_email') && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) bad(`${key === 'email' ? 'Public email' : 'Notification email'} is not a valid address.`);
    stmts.push(env.DB.prepare('INSERT INTO site_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json(await loadSettings(env));
});

/* ── inquiries ────────────────────────────────────────────────────── */
route('GET', '/inquiries', async (_req, env) => json((await env.DB.prepare('SELECT * FROM catering_inquiries ORDER BY submitted_at DESC, id DESC').all<Inquiry>()).results));
route('GET', '/inquiries.csv', async (_req, env) => {
  const rows = (await env.DB.prepare('SELECT * FROM catering_inquiries ORDER BY submitted_at DESC, id DESC').all<Inquiry>()).results;
  const cols: (keyof Inquiry)[] = ['id', 'submitted_at', 'name', 'phone', 'email', 'event_date', 'headcount', 'event_location', 'message', 'notify_status', 'notify_error'];
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
  return new Response('﻿' + csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="el-compita-catering-inquiries.csv"', 'cache-control': 'no-store' },
  });
});
route('DELETE', '/inquiries/:id', async (_req, env, p) => {
  await env.DB.prepare('DELETE FROM catering_inquiries WHERE id = ?1').bind(Number(p.id)).run();
  return json({ ok: true });
});

/* ── dispatcher ───────────────────────────────────────────────────── */
export async function handleAdminApi(req: Request, env: Env, subpath: string): Promise<Response> {
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = subpath.match(r.pattern);
    if (!m) continue;
    if (!r.public) await requireAuth(env, req);
    const params: Params = {};
    r.keys.forEach((k, i) => { params[k] = m[i + 1] ?? ''; });
    return r.handler(req, env, params);
  }
  throw new HttpError(404, 'Not found');
}
