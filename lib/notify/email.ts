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

/**
 * Generic transactional send for BILLING correspondence — dunning, cap
 * notices, recovery. Separate from the demo-lead helpers above because the
 * audience and the stakes differ: these go to a paying contractor about his
 * account, and the body is authored copy from OFFER.md rather than a
 * generated summary.
 *
 * `body` arrives as light markdown (the OFFER.md copy uses **bold** and
 * [links](url)); this converts the two constructs that copy actually uses
 * and escapes everything else. A full markdown dependency for two syntaxes
 * would fail this build's dependency discipline.
 */
export async function sendBillingEmail(args: {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}): Promise<EmailResult> {
  const html = markdownishToHtml(args.body);
  return sendViaResend({ to: args.to, subject: args.subject, html, replyTo: args.replyTo });
}

function markdownishToHtml(body: string): string {
  const escaped = escapeHtml(body);
  const withLinks = escaped.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2">$1</a>'
  );
  const withBold = withLinks.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return withBold
    .split(/\n{2,}/)
    .map((para) => '<p>' + para.replace(/\n/g, '<br>') + '</p>')
    .join('\n');
}

export interface DemoLeadEmailFields {
  name: string;
  phone: string;
  email: string;
  timeline: string;
  surface: 'public_hub' | 'demo';
  createdAt: string;
  /**
   * The quoted band, already formatted (e.g. "$3,069 - $4,152"). Null when the
   * capture was degraded and no price was ever calculated — which is a real
   * state, not a missing value, so the email says so rather than omitting the
   * line and leaving the reader to wonder.
   */
  priceRange?: string | null;
  /** Signed URL for the ORIGINAL photo of the slab. */
  photoUrl?: string | null;
  /** Signed URL for the finish RENDER the homeowner was shown. */
  renderUrl?: string | null;
  /** Must accompany renderUrl wherever it appears. See lib/ai/visualise.ts. */
  renderDisclosure?: string | null;
}

/**
 * The block that shows what the homeowner actually saw.
 *
 * WHY THIS IS A SHARED FUNCTION rather than inline in each template: the
 * render carries a disclosure that is not optional, and the fastest way to
 * lose it is to have two templates each build their own markup. One builder
 * means the caption cannot be forgotten in one place and remembered in the
 * other.
 *
 * IMAGES ARE LINKED, NOT EMBEDDED. Most mail clients block remote images by
 * default and inlining two photographs would make the message large enough to
 * be clipped by Gmail — which truncates the end of a long email behind a
 * "view entire message" link, and the end is where the contractor's own
 * details live. A labelled link always works.
 */
function evidenceBlock(fields: DemoLeadEmailFields): string {
  let html = '';

  if (fields.priceRange) {
    html += '<p><strong>Quoted range:</strong> ' + escapeHtml(fields.priceRange) + '</p>';
  } else {
    html +=
      '<p><em>No price was calculated for this one \u2014 the quoting engine was ' +
      'degraded, so the details were captured without a range.</em></p>';
  }

  if (fields.photoUrl) {
    html +=
      '<p><a href="' + escapeHtml(fields.photoUrl) + '">The photo they sent of the floor</a></p>';
  }

  if (fields.renderUrl) {
    html +=
      '<p><a href="' + escapeHtml(fields.renderUrl) +
      '">The finish preview they were shown</a></p>';
    if (fields.renderDisclosure) {
      // The disclosure travels with the render EVERYWHERE, including here.
      // A contractor who reads it is a contractor who will not be blindsided
      // when the homeowner holds up his phone on site.
      html +=
        '<p style="font-size:13px;color:#8A8880">' +
        escapeHtml(fields.renderDisclosure) +
        '</p>';
    }
  }

  // Links are short-lived by design. Saying so is the difference between a
  // contractor saving the image now and discovering a dead link in a week.
  if (fields.photoUrl || fields.renderUrl) {
    html +=
      '<p style="font-size:13px;color:#8A8880">Those links expire in seven days. ' +
      'Save anything you want to keep.</p>';
  }

  return html;
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
    evidenceBlock(fields) +
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
    evidenceBlock(fields) +
    /* The old copy here promised that on a real site this "arrives with the
       calculated price range and photo attached" — a promise the code did not
       keep, in the one email whose entire job is to demonstrate the product
       honestly. It now sends them, so the sentence describes what just
       happened rather than what would hypothetically happen elsewhere. */
    '<p>Everything above arrived the moment they pressed Send. On your own site it works exactly this way, under your name.</p>';
  return sendViaResend({
    to: fields.email,
    subject: 'Here\u2019s what you\u2019d have just received',
    html,
  });
}
