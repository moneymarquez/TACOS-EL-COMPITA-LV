import type { Env } from '../env';
import type { Inquiry } from '../db';
import { notifyOwner } from '../email';
import { HttpError, isIsoDate, json, str } from '../util';

interface InquiryInput {
  name: string; phone: string; email: string; event_date: string;
  headcount: number | null; event_location: string; message: string; website: string;
}

async function readInput(req: Request): Promise<{ input: InquiryInput; wantsHtml: boolean }> {
  const ct = req.headers.get('content-type') ?? '';
  let raw: Record<string, unknown> = {};
  let wantsHtml = false;
  if (ct.includes('application/json')) {
    raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } else if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    for (const [k, v] of fd.entries()) raw[k] = typeof v === 'string' ? v : '';
    wantsHtml = true; // plain <form> post (JS off) - answer with a redirect
  } else {
    throw new HttpError(415, 'Unsupported content type');
  }
  const hc = str(raw.headcount, 10);
  return {
    wantsHtml,
    input: {
      name: str(raw.name, 120),
      phone: str(raw.phone, 40),
      email: str(raw.email, 200),
      event_date: str(raw.event_date, 10),
      headcount: hc === '' ? null : Number(hc),
      event_location: str(raw.event_location, 300),
      message: str(raw.message, 3000),
      website: str(raw.website, 100), // honeypot - humans never see it
    },
  };
}

function validate(i: InquiryInput): string[] {
  const errors: string[] = [];
  if (i.name.length < 2) errors.push('Please enter your name.');
  if (i.phone.replace(/\D/g, '').length < 10) errors.push('Please enter a phone number we can reach you at.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email)) errors.push('Please enter a valid email address.');
  if (!isIsoDate(i.event_date)) errors.push('Please pick an event date.');
  if (i.headcount !== null && (!Number.isInteger(i.headcount) || i.headcount < 1 || i.headcount > 100000)) errors.push('Headcount must be a whole number.');
  return errors;
}

export async function handleInquiry(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { input, wantsHtml } = await readInput(req);
  const back = (params: string) => Response.redirect(new URL(`/?${params}#catering`, req.url).toString(), 303);

  if (input.website) {
    // Bot filled the honeypot. Pretend success, store nothing.
    return wantsHtml ? back('inquiry=sent') : json({ ok: true });
  }
  const errors = validate(input);
  if (errors.length) {
    return wantsHtml ? back(`inquiry=error&msg=${encodeURIComponent(errors.join(' '))}`) : json({ ok: false, errors }, 400);
  }

  const inserted = await env.DB.prepare(
    `INSERT INTO catering_inquiries (name, phone, email, event_date, headcount, event_location, message)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING *`,
  ).bind(input.name, input.phone, input.email, input.event_date, input.headcount, input.event_location, input.message)
    .first<Inquiry>();
  if (!inserted) throw new HttpError(500, 'Could not save your inquiry.');

  // Email the owner after the response is sent so the visitor is never kept waiting on Resend.
  ctx.waitUntil((async () => {
    const to = (await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'notify_email'").first<{ value: string }>())?.value ?? '';
    const r = await notifyOwner(env, to.trim(), inserted);
    await env.DB.prepare('UPDATE catering_inquiries SET notify_status = ?1, notify_error = ?2 WHERE id = ?3')
      .bind(r.status, r.error, inserted.id).run();
  })());

  return wantsHtml ? back('inquiry=sent') : json({ ok: true, id: inserted.id });
}
