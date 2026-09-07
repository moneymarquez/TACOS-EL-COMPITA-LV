import type { Env } from './env';
import type { Inquiry } from './db';
import { esc } from './util';

export interface NotifyResult { status: 'sent' | 'failed' | 'not_configured'; error: string }

/**
 * Emails the owner about a new catering inquiry via Resend.
 * Never throws - the inquiry is already stored; the outcome is recorded on the row.
 */
export async function notifyOwner(env: Env, to: string, inq: Inquiry): Promise<NotifyResult> {
  if (!env.RESEND_API_KEY) return { status: 'not_configured', error: 'RESEND_API_KEY secret is not set' };
  if (!to) return { status: 'not_configured', error: 'Notification email is blank in Admin > Contact & settings' };

  const lines: [string, string][] = [
    ['Name', inq.name], ['Phone', inq.phone], ['Email', inq.email], ['Event date', inq.event_date],
    ['Headcount', inq.headcount === null ? '' : String(inq.headcount)], ['Location', inq.event_location], ['Message', inq.message],
  ];
  const text = `New catering inquiry from the El Compita website\n\n` +
    lines.map(([k, v]) => `${k}: ${v || '-'}`).join('\n') +
    `\n\nReply to this email to answer ${inq.name} directly.\nAll inquiries: ${env.SITE_URL}/admin`;
  const html = `<p><strong>New catering inquiry from the El Compita website</strong></p><table>` +
    lines.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0"><strong>${esc(k)}</strong></td><td>${esc(v || '-')}</td></tr>`).join('') +
    `</table><p>Reply to this email to answer ${esc(inq.name)} directly.<br>All inquiries: <a href="${esc(env.SITE_URL)}/admin">${esc(env.SITE_URL)}/admin</a></p>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [to],
        reply_to: inq.email,
        subject: `Catering inquiry: ${inq.name} · ${inq.event_date}${inq.headcount ? ` · ${inq.headcount} people` : ''}`,
        text,
        html,
      }),
    });
    if (!res.ok) return { status: 'failed', error: `Resend ${res.status}: ${(await res.text()).slice(0, 500)}` };
    return { status: 'sent', error: '' };
  } catch (e) {
    return { status: 'failed', error: String(e).slice(0, 500) };
  }
}
