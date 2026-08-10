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

// ---------------------------------------------------------------------------
// PHASE 4 — THE HOUSE STYLE
//
// These emails are marketing artefacts. A contractor is shown one on a phone
// and decides whether this software looks like something he would put his name
// on, so a bare stack of <p> tags is not good enough — but neither is anything
// that only renders in one client.
//
// THE RULES EMAIL HTML ACTUALLY IMPOSES, and why each one is obeyed:
//
//   TABLES FOR LAYOUT. Outlook on Windows renders through Word, which has no
//   float, no flexbox and no grid. A table is the only container that lands the
//   same way everywhere. This is not 2005 nostalgia; it is the current state of
//   the one client contractors' offices actually run.
//
//   INLINE STYLES ONLY. Gmail strips <style> blocks in several contexts,
//   including the mobile app. A class here is a style that works on your phone
//   and vanishes on his.
//
//   NO WEB FONTS. Instrument Serif is the site's display face and is not
//   available to a mail client. Georgia is the closest widely-installed serif
//   and it is what the header uses — the family differs, the IMPRESSION holds.
//   A @font-face that silently falls back to Times would look worse than
//   choosing Georgia deliberately.
//
//   NO BACKGROUND IMAGES, no gradients, no shadows. All three are stripped or
//   mangled somewhere that matters. Flat colour blocks survive everything.
//
//   NO REMOTE IMAGES INLINE. Most clients block them by default, so a design
//   that depends on one arrives broken. Pictures are LINKED with a label that
//   says what is on the other side.
// ---------------------------------------------------------------------------

/** The site's own palette, restated here because a mail client cannot read a CSS token. */
const INK = '#1A1A18';
const SHEET = '#FBFAF7';
const RULE = '#8A8880';
const HAZARD = '#A8511B';
const CONCRETE = '#EFECE6';

/**
 * The outer frame every email in this module shares.
 *
 * 600px is the width that has been safe since Outlook 2007 and still is. The
 * outer table is full-width with the page colour so the message does not sit
 * on a raw white rectangle in a dark-mode client.
 */
function shell(args: { eyebrow: string; title: string; body: string; footer?: string }): string {
  return (
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:' + CONCRETE + ';">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="background:' + CONCRETE + ';padding:24px 12px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" ' +
    'style="width:100%;max-width:600px;background:' + SHEET + ';border:1px solid ' + RULE + ';">' +

    // masthead
    '<tr><td style="background:' + INK + ';padding:20px 24px;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:22px;color:' + SHEET + ';">Girder</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.5px;' +
    'text-transform:uppercase;color:' + RULE + ';padding-top:4px;">' + escapeHtml(args.eyebrow) + '</div>' +
    '</td></tr>' +

    // title
    '<tr><td style="padding:24px 24px 0;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:26px;line-height:1.2;color:' + INK + ';">' +
    escapeHtml(args.title) + '</div>' +
    '</td></tr>' +

    // body
    '<tr><td style="padding:16px 24px 24px;font-family:Arial,Helvetica,sans-serif;' +
    'font-size:15px;line-height:1.55;color:' + INK + ';">' + args.body + '</td></tr>' +

    (args.footer
      ? '<tr><td style="padding:14px 24px;border-top:1px solid ' + RULE + ';' +
        'font-family:Arial,Helvetica,sans-serif;font-size:12px;color:' + RULE + ';">' +
        args.footer + '</td></tr>'
      : '') +

    '</table></td></tr></table></body></html>'
  );
}

/** A labelled section divider — this is what makes the two-sided email readable. */
function sectionHead(label: string, note: string): string {
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="margin:26px 0 12px;"><tr><td style="border-left:3px solid ' + HAZARD + ';padding-left:12px;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.5px;' +
    'text-transform:uppercase;color:' + HAZARD + ';">' + escapeHtml(label) + '</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:' + RULE + ';padding-top:3px;">' +
    escapeHtml(note) + '</div>' +
    '</td></tr></table>'
  );
}

/** The price band, set large. The single most important thing in the message. */
function priceBlock(range: string | null): string {
  if (!range) {
    return (
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
      'style="background:' + CONCRETE + ';border:1px solid ' + RULE + ';margin:4px 0;">' +
      '<tr><td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:' + RULE + ';">' +
      'No price was calculated for this one \u2014 the quoting engine was degraded, so the ' +
      'details were captured without a range.</td></tr></table>'
    );
  }
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="background:' + CONCRETE + ';border:1px solid ' + INK + ';margin:4px 0;">' +
    '<tr><td style="padding:16px;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.5px;' +
    'text-transform:uppercase;color:' + RULE + ';">Estimated range</div>' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:30px;color:' + INK + ';padding-top:6px;">' +
    escapeHtml(range) + '</div>' +
    '</td></tr></table>'
  );
}

/** A bordered link that reads as a button but is a plain anchor, so it survives everything. */
function linkRow(href: string, label: string): string {
  return (
    '<p style="margin:10px 0;"><a href="' + escapeHtml(href) +
    '" style="display:inline-block;padding:11px 16px;border:1px solid ' + INK +
    ';color:' + INK + ';font-family:Arial,Helvetica,sans-serif;font-size:14px;text-decoration:none;">' +
    escapeHtml(label) + '</a></p>'
  );
}

/** Name, phone, email, timeline as a table. What a contractor acts on. */
function contactBlock(fields: DemoLeadEmailFields): string {
  const row = (k: string, v: string) =>
    '<tr><td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;' +
    'letter-spacing:1px;text-transform:uppercase;color:' + RULE + ';width:96px;vertical-align:top;">' +
    escapeHtml(k) + '</td>' +
    '<td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:' + INK + ';">' +
    v + '</td></tr>';

  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    row('Name', escapeHtml(fields.name)) +
    row('Phone', '<a href="tel:' + escapeHtml(fields.phone) + '" style="color:' + INK + ';">' +
      escapeHtml(fields.phone) + '</a>') +
    row('Email', '<a href="mailto:' + escapeHtml(fields.email) + '" style="color:' + INK + ';">' +
      escapeHtml(fields.email) + '</a>') +
    row('Timeline', escapeHtml(fields.timeline)) +
    '</table>'
  );
}

/**
 * What the homeowner actually saw: the range, the photo, the render, and the
 * disclosure that must travel with it.
 *
 * WHY THIS IS A SHARED FUNCTION rather than inline in each template: the
 * render carries a disclosure that is not optional, and the fastest way to
 * lose it is to have three templates each build their own markup. One builder
 * means the caption cannot be forgotten in one place and remembered in the
 * other.
 *
 * IMAGES ARE LINKED, NOT EMBEDDED. Most mail clients block remote images by
 * default and inlining two photographs would make the message large enough to
 * be clipped by Gmail — which truncates the end behind a "view entire message"
 * link, and the end is where the contractor's own details live. A labelled
 * link always works.
 */
function evidenceBlock(fields: DemoLeadEmailFields): string {
  let html = priceBlock(fields.priceRange ?? null);

  if (fields.photoUrl) {
    html += linkRow(fields.photoUrl, 'The photo they sent of the floor');
  }

  if (fields.renderUrl) {
    html += linkRow(fields.renderUrl, 'The finish preview they were shown');
    if (fields.renderDisclosure) {
      // The disclosure travels with the render EVERYWHERE, including here. A
      // contractor who reads it is a contractor who will not be blindsided
      // when the homeowner holds up his phone on site.
      html +=
        '<p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:' +
        RULE + ';">' + escapeHtml(fields.renderDisclosure) + '</p>';
    }
  }

  // Links are short-lived by design. Saying so is the difference between a
  // contractor saving the image now and finding a dead link in a week.
  if (fields.photoUrl || fields.renderUrl) {
    html +=
      '<p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:' +
      RULE + ';">Those links expire in seven days. Save anything you want to keep.</p>';
  }

  return html;
}

/**
 * ============================================================================
 * THE THREE RECIPIENTS, AND WHY EACH GETS A DIFFERENT DOCUMENT
 * ============================================================================
 *
 * One submission produces three emails, because three people need three
 * different things from it and a single template serving all of them would
 * serve none of them well:
 *
 *   THE PERSON WHO SUBMITTED gets their quote. Warm, addressed to them, no
 *   internal language. They asked for a price and a picture; this is it.
 *
 *   THE OPERATOR gets the lead. Terse, scannable on a lock screen, reply-to
 *   set to the submitter so the correct action is to hit reply.
 *
 *   THE BUSINESS TRYING THE TOOL OUT gets BOTH SIDES in one message — what
 *   their customer received, and what would have landed in their own inbox.
 *   That is the demonstration: not a description of how the product works, the
 *   actual artefacts it produced, side by side, from their own submission.
 *
 * ============================================================================
 * WHO THE THIRD EMAIL GOES TO, AND WHY IT IS NOT A PARAMETER FROM THE BROWSER
 * ============================================================================
 *
 * The obvious design is an argument — pass the contractor's address in with
 * the submission. DO NOT DO THIS. An action that accepts an arbitrary address
 * from an anonymous caller and sends mail to it is an open relay: anyone could
 * point it at any inbox, from a domain the operator owns, and the deliverability
 * of that domain would not survive the week.
 *
 * So the recipient is only ever an address the software already trusts:
 *
 *   - the address just typed into the form, which is where the confirmation
 *     was always going, or
 *   - one resolved SERVER-SIDE from a prototype id.
 *
 * `sendBothSidesPreview` therefore takes no recipient of its own; it sends to
 * fields.email. On the public card the person trying the tool IS the person
 * submitting, which is the case this exists for.
 */

/**
 * Notifies the operator that somebody left contact details. A real inbound
 * lead for NVA Digital Solutions itself, not a test event.
 */
export async function notifyAdminOfDemoLead(fields: DemoLeadEmailFields): Promise<EmailResult> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return { status: 'skipped', error: 'not_configured' };

  const body =
    contactBlock(fields) +
    '<div style="height:18px"></div>' +
    evidenceBlock(fields);

  return sendViaResend({
    to,
    subject: 'New lead: ' + fields.name + (fields.priceRange ? ' \u00b7 ' + fields.priceRange : ''),
    html: shell({
      eyebrow: 'From ' + fields.surface.replace('_', ' '),
      title: fields.name,
      body,
      footer:
        escapeHtml(new Date(fields.createdAt).toLocaleString('en-US')) +
        ' \u00b7 reply straight to this email',
    }),
    replyTo: fields.email,
  });
}

/**
 * THE CUSTOMER'S OWN COPY. Their price, their picture, their words.
 *
 * Deliberately contains no meta-commentary about the software. A homeowner
 * does not care that this demonstrates anything; he asked what his garage
 * costs. Every sentence about "how this works on your own site" belongs in the
 * other email, to the other reader.
 */
export async function sendCustomerQuote(fields: DemoLeadEmailFields): Promise<EmailResult> {
  const body =
    '<p style="margin:0 0 4px;">Here is the range for your floor, ' +
    escapeHtml(fields.name.split(' ')[0] ?? fields.name) +
    '.</p>' +
    evidenceBlock(fields) +
    '<p style="margin:18px 0 0;">An installer will call you about it. You said ' +
    escapeHtml(fields.timeline.toLowerCase()) + ', so expect to hear from them accordingly.</p>' +
    '<p style="margin:12px 0 0;color:' + RULE + ';font-size:14px;">' +
    'This is an estimate, not a contract. The final figure is confirmed once ' +
    'somebody has seen the concrete in person \u2014 that is true of every ' +
    'quote in this trade, and anyone who tells you otherwise before looking is ' +
    'guessing.</p>';

  return sendViaResend({
    to: fields.email,
    subject: 'Your floor: ' + (fields.priceRange ?? 'the details you sent'),
    html: shell({
      eyebrow: 'Your estimate',
      title: fields.priceRange ?? 'Your details are in',
      body,
    }),
  });
}

/**
 * BOTH SIDES OF THE SAME SUBMISSION, in one message, for the business owner
 * evaluating the tool.
 *
 * The order is not arbitrary. The customer's view comes FIRST because that is
 * the half he has never seen and cannot picture — he knows what a lead looks
 * like, he does not know what his customer's experience feels like. Opening
 * with his own inbox would put the familiar half on top and bury the argument.
 *
 * Nothing here is illustrative. Both blocks are rendered from the same fields
 * that were actually sent, so what he reads is what the two people involved
 * genuinely received. A mocked-up example in this email would be the exact
 * failure the rest of this codebase is built to avoid.
 */
export async function sendBothSidesPreview(fields: DemoLeadEmailFields): Promise<EmailResult> {
  const body =
    '<p style="margin:0;">You just ran the tool. Two emails went out from that one ' +
    'submission. Here they both are.</p>' +

    sectionHead('As the customer', 'What the person pricing the job receives') +
    evidenceBlock(fields) +
    '<p style="margin:12px 0 0;color:' + RULE + ';font-size:14px;">' +
    'They get the range and the picture immediately, under your name, without ' +
    'anyone picking up a phone.</p>' +

    sectionHead('As the business owner', 'What lands in your inbox at the same moment') +
    contactBlock(fields) +
    '<p style="margin:14px 0 0;color:' + RULE + ';font-size:14px;">' +
    'A name, a live number, the size of the job and what they were quoted \u2014 ' +
    'before the first call. You already know whether it is worth the drive.</p>';

  return sendViaResend({
    to: fields.email,
    subject: 'Both sides of the lead you just created',
    html: shell({
      eyebrow: 'What just happened',
      title: 'Your customer got a price. You got the job.',
      body,
      footer: 'Every figure above came from your own submission. Nothing here is illustrative.',
    }),
  });
}

/**
 * KEPT AS AN ALIAS so nothing that imported the old name breaks. New callers
 * should choose deliberately between sendCustomerQuote and
 * sendBothSidesPreview — those are different readers.
 */
export async function sendDemoContractorConfirmation(
  fields: DemoLeadEmailFields
): Promise<EmailResult> {
  return sendBothSidesPreview(fields);
}

// ---------------------------------------------------------------------------
// PHASE 16L — IMPLEMENTATION REQUESTS
//
// A contractor asking us to build something. Added because rows were landing in
// `implementation_requests` and nothing was telling anyone, while the form's own
// success copy promised a reply within one working day.
//
// WHY THIS IS NOT notifyAdminOfDemoLead WITH DIFFERENT ARGUMENTS. That
// function's shape is a homeowner lead — timeline, quoted range, a photo of a
// slab, a finish render and its disclosure — and its `surface` is typed to
// 'public_hub' | 'demo'. Forcing this through it would produce an email that
// misdescribes what arrived, on the one message you are meant to act on.
//
// The audiences are opposite too. A demo lead is a stranger who tried the
// product. This is a business owner who has described his company to you and is
// waiting on a human reply — which is why reply_to is his address: the correct
// action on receiving this email is to hit reply.
// ---------------------------------------------------------------------------

export interface ImplementationRequestEmailFields {
  kind: 'tool_install' | 'custom_build';
  /** Which tool page it came from. Null for the homepage's open question. */
  toolId: string | null;
  name: string;
  email: string;
  phone: string | null;
  businessName: string | null;
  businessField: string | null;
  websiteUrl: string | null;
  customerType: string | null;
  description: string;
  createdAt: string;
}

/** Renders one optional field, or nothing. Omitted fields stay omitted. */
function optionalRow(label: string, value: string | null): string {
  if (!value) return '';
  return '<p><strong>' + escapeHtml(label) + ':</strong> ' + escapeHtml(value) + '</p>';
}

export async function notifyAdminOfImplementationRequest(
  fields: ImplementationRequestEmailFields
): Promise<EmailResult> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return { status: 'skipped', error: 'not_configured' };

  const install = fields.kind === 'tool_install';

  // The subject has to be actionable from a phone lock screen, so the business
  // name leads where there is one — that is what tells you whether this is
  // worth opening now or after the job.
  const who = fields.businessName ?? fields.name;
  const subject = install
    ? 'Wants it on their site: ' + who + (fields.toolId ? ' (' + fields.toolId + ')' : '')
    : 'Has a problem to solve: ' + who;

  const html =
    '<p><strong>' +
    (install ? 'Someone wants a tool on their site' : 'Someone described a problem') +
    '</strong></p>' +
    '<p>' +
    escapeHtml(fields.name) +
    '<br>' +
    escapeHtml(fields.email) +
    (fields.phone ? '<br>' + escapeHtml(fields.phone) : '') +
    '</p>' +
    optionalRow('Business', fields.businessName) +
    optionalRow('Trade', fields.businessField) +
    optionalRow('Website', fields.websiteUrl) +
    optionalRow('Their customers', fields.customerType) +
    (fields.toolId ? optionalRow('Came from', '/tools/' + fields.toolId) : '') +
    '<p><strong>' +
    (install ? 'About the business' : 'The problem') +
    ':</strong></p>' +
    // Line breaks preserved: he typed this in paragraphs, and collapsing them
    // into one block makes a considered answer look like a rushed one.
    '<p>' + escapeHtml(fields.description).replace(/\n/g, '<br>') + '</p>' +
    '<p style="font-size:13px;color:#8A8880">' +
    escapeHtml(new Date(fields.createdAt).toLocaleString('en-US')) +
    ' \u00b7 reply straight to this email</p>';

  return sendViaResend({ to, subject, html, replyTo: fields.email });
}

