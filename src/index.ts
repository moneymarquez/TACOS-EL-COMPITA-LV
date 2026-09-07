import type { Env } from './env';
import { loadSiteData } from './db';
import { renderHome } from './render/home';
import { handleInquiry } from './api/public';
import { handleAdminApi } from './api/admin';
import { HttpError, json, todayIn } from './util';

const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
};

function withHeaders(res: Response, extra: Record<string, string>): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(extra)) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      // Home page - server-rendered from D1 so the first paint already has the schedule and menu.
      if (path === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
        const today = todayIn(env.SITE_TIMEZONE);
        const data = await loadSiteData(env, today);
        const q = url.searchParams.get('inquiry');
        const flash = q === 'sent'
          ? { kind: 'sent' as const, msg: 'Thanks! Your inquiry is in. We will get back to you soon.' }
          : q === 'error'
            ? { kind: 'error' as const, msg: url.searchParams.get('msg') || 'Something went wrong. Please try again.' }
            : null;
        const html = renderHome(data, env, today, flash);
        return withHeaders(new Response(html, {
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
        }), SECURITY_HEADERS);
      }

      // Photos from R2. Keys are unique per upload, so they can be cached hard.
      if (path.startsWith('/photos/') && req.method === 'GET') {
        const key = decodeURIComponent(path.slice('/photos/'.length));
        if (!/^[\w.-]+$/.test(key)) return new Response('Not found', { status: 404 });
        const obj = await env.PHOTOS.get(key);
        if (!obj) return new Response('Not found', { status: 404 });
        const headers = new Headers();
        obj.writeHttpMetadata(headers);
        headers.set('etag', obj.httpEtag);
        headers.set('cache-control', 'public, max-age=31536000, immutable');
        return withHeaders(new Response(obj.body, { headers }), SECURITY_HEADERS);
      }

      if (path === '/api/inquiries' && req.method === 'POST') {
        return withHeaders(await handleInquiry(req, env, ctx), SECURITY_HEADERS);
      }

      if (path.startsWith('/api/admin/')) {
        return withHeaders(await handleAdminApi(req, env, path.slice('/api/admin'.length)), SECURITY_HEADERS);
      }

      if (path === '/api/health') {
        return json({ ok: true, adminConfigured: Boolean(env.ADMIN_PASSWORD), emailConfigured: Boolean(env.RESEND_API_KEY) });
      }

      // Everything else: static assets in ./public (site.css, site.js, /admin, favicon).
      const asset = await env.ASSETS.fetch(req);
      if (asset.status === 404) {
        return withHeaders(new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } }), SECURITY_HEADERS);
      }
      return withHeaders(asset, SECURITY_HEADERS);
    } catch (e) {
      if (e instanceof HttpError) {
        return withHeaders(json({ ok: false, error: e.message }, e.status), SECURITY_HEADERS);
      }
      console.error('Unhandled error', e);
      const wantsJson = path.startsWith('/api/') || (req.headers.get('accept') ?? '').includes('application/json');
      return withHeaders(
        wantsJson
          ? json({ ok: false, error: 'Something went wrong on our end. Please try again.' }, 500)
          : new Response('Something went wrong on our end. Please try again in a moment.', { status: 500, headers: { 'content-type': 'text/plain' } }),
        SECURITY_HEADERS,
      );
    }
  },
} satisfies ExportedHandler<Env>;
