import 'server-only';

/**
 * lib/notify/email.ts — Resend adapter. Raw fetch, zero dependency, same
 * pattern as lib/quote/vision.ts's call to Anthropic: this stack does not
 * install an SDK for a single REST endpoint.
 *
 * NEVER BLOCKS THE CALLER. Every export here resolves to a result object —
 * it never throws — because the money rule that matters most is "lead
 * capture never stops," and an email provider having a bad day must not be
 * the reason a lead write fails. Callers fire these and record the outcome
 * in leads.delivery_status; they do not await them before responding to the
 * visitor.
 *
 * UNCONFIGURED IS A VALID STATE, not an error: EMAIL_FROM / RESEND_API_KEY /
 * ADMIN_NOTIFY_EMAIL are unset on a fresh clone (ENV.md, Phase 1), and this
 * module degrades to a no-op 'skipped' result rather than failing the build
 * or the request.
 *
 * VERIFY: api.resend.com is not reachable from this build sandbox (it is not
 * on the allowed egress list), so this integration is written to Resend's
 * documented REST contract but has not been execution-tested against a live
 * key the way the SQL and the pricing engine were. Send one real test email
 * after deploy before relying on it.
 */

export interface EmailResult {
  status: 'sent' | 'skipped' | 'failed';
  error?: string;
}

async function sendViaResend(args: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { status: 'skipped', error: 'not_configured' };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { status: 'failed', error: 'resend_' + res.status + (body ? ': ' + body.slice(0, 200) : '') };
    }
    return { status: 'sent' };
  } catch (e) {
    return { status: 'failed', error: e instanceof Error ? e.message : 'unknown_error' };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface DemoLeadEmailFields {
  name: string;
  phone: string;
  email: string;
  timeline: string;
  surface: 'public_hub' | 'demo';
  createdAt: string;
}

/**
 * Notifies the admin (Dawsen) that a prospective contractor tried the demo
 * and left contact details — this is a real inbound lead for NVA Digital
 * Solutions itself, not a test event.
 */
export async function notifyAdminOfDemoLead(fields: DemoLeadEmailFields): Promise<EmailResult> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return { status: 'skipped', error: 'not_configured' };
  const html =
    '<p><strong>New demo lead</strong> from ' + escapeHtml(fields.surface) + '</p>' +
    '<p>' + escapeHtml(fields.name) + '<br>' +
    escapeHtml(fields.phone) + '<br>' +
    escapeHtml(fields.email) + '</p>' +
    '<p>Timeline: ' + escapeHtml(fields.timeline) + '</p>' +
    '<p>' + escapeHtml(new Date(fields.createdAt).toLocaleString('en-US')) + '</p>';
  return sendViaResend({
    to,
    subject: 'New demo lead: ' + fields.name,
    html,
    replyTo: fields.email,
  });
}

/**
 * Sent to the DEMO VISITOR's own address — the point is not just to confirm
 * receipt, it is to hand them the exact artefact a real contractor would get
 * the instant a real homeowner submits: this email IS the second half of the
 * "aha moment," arriving after they've already left the payload screen.
 */
export async function sendDemoContractorConfirmation(fields: DemoLeadEmailFields): Promise<EmailResult> {
  const html =
    '<p>This is the notification a homeowner\u2019s submission sends the moment they hit "Send."</p>' +
    '<p><strong>' + escapeHtml(fields.name) + '</strong><br>' +
    escapeHtml(fields.phone) + '<br>' +
    escapeHtml(fields.email) + '</p>' +
    '<p>Timeline: ' + escapeHtml(fields.timeline) + '</p>' +
    '<p>On your own site, this arrives with the calculated price range and photo attached, the moment it happens.</p>';
  return sendViaResend({
    to: fields.email,
    subject: 'Here\u2019s what you\u2019d have just received',
    html,
  });
}
