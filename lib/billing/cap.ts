import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendBillingEmail } from '@/lib/notify/email';
import { trackServer } from '@/lib/analytics.server';

/**
 * lib/billing/cap.ts — THE CAP UPSELL.
 *
 * THE FRAMING RULE, which is the whole point: hitting the cap is a SUCCESS
 * message, never a warning. He got 25 quote requests this month and
 * homeowners are still coming — that is a good problem, and the copy says so
 * in the subject line. Nothing is taken away (money rule #1): the site stays
 * up, the form stays live, and lead capture is untouched. Only the instant
 * photo price pauses.
 *
 * Copy is OFFER.md §3.2 and §3.3 verbatim.
 *
 * NOBODY IS EVER BLOCKED FROM LEAVING THEIR CONTACT DETAILS. This module
 * sends messages; it does not gate anything. The actual degradation is
 * decided by lib/entitlements/check.ts and rendered by Phase 4's
 * DegradedFlow, which never mentions billing to a homeowner.
 */

export interface CapNoticeContext {
  contractorName: string;
  analysesUsed: number;
  analysisLimit: number;
  leadsCaptured: number;
  renewalDate: string;
  upgradeUrl: string;
}

export function earlyWarningMessage(ctx: CapNoticeContext) {
  return {
    subject: "You're at " + ctx.analysesUsed + ' of ' + ctx.analysisLimit + ' photo analyses this month',
    body:
      'Heads up — homeowners have run ' + ctx.analysesUsed + ' instant quotes on your site this month, and you\u2019ve captured ' +
      ctx.leadsCaptured + ' leads.\n\n' +
      'At ' + ctx.analysisLimit + ', the instant photo pricing pauses until ' + ctx.renewalDate +
      '. Your site stays up, your form stays live, and leads keep coming in — they\u2019ll just come through without the instant price attached.\n\n' +
      'If you\u2019d rather it didn\u2019t pause: Operator removes the cap. $500 setup credit applies since you\u2019re already set up — [upgrade](' +
      ctx.upgradeUrl + ').\n\n' +
      'Nothing to do if you\u2019re happy as you are.',
  };
}

export function capReachedMessage(ctx: CapNoticeContext) {
  return {
    subject: ctx.analysisLimit + " quotes this month — that's the cap, and it's a good problem",
    body:
      'Your site ran its ' + ctx.analysisLimit + 'th instant quote today, and you\u2019ve captured ' + ctx.leadsCaptured +
      ' leads this month. Homeowners are still coming.\n\n' +
      'Here\u2019s exactly what changed: instant photo pricing is paused until ' + ctx.renewalDate +
      '. Here\u2019s what didn\u2019t: your site is up, your form is live, and every homeowner who lands on it still reaches you. Nobody is being turned away.\n\n' +
      'The leads arriving now come in without an instant price attached, so they may want a callback sooner than usual — they\u2019re marked in your inbox.\n\n' +
      'Operator removes the cap for good: $500/month, no per-quote limit. [Upgrade](' + ctx.upgradeUrl +
      '). Or sit tight and the counter resets on ' + ctx.renewalDate + '.',
  };
}

/**
 * Notifies the contractor AND raises the admin hot-upsell alert.
 *
 * Called from lib/quote/usage.ts's crossing detection, which already fires
 * exactly once — on the increment that crosses the threshold — so this
 * function does not need its own dedupe for the common path. The
 * warned_at_20 stamp below is the backstop for the uncommon one: a retried
 * request or a period boundary landing mid-flight.
 */
export async function sendCapNotice(args: {
  prototypeId: string;
  kind: 'warning' | 'reached';
}): Promise<{ sent: boolean; reason?: string }> {
  const db = getSupabaseAdminClient();

  const { data: rows } = await db.rpc('billing_overview');
  const row = (rows ?? []).find((r) => r.prototype_id === args.prototypeId);
  if (!row) return { sent: false, reason: 'no_billing_row' };
  if (!row.email) return { sent: false, reason: 'no_contractor_email' };
  if (row.analysis_limit === null) return { sent: false, reason: 'unlimited_plan' };

  // Backstop dedupe for the early warning.
  if (args.kind === 'warning') {
    const { data: counter } = await db
      .from('usage_counters')
      .select('warned_at_20')
      .eq('prototype_id', args.prototypeId)
      .eq('period_start', row.current_period_start)
      .maybeSingle();
    if (counter?.warned_at_20) return { sent: false, reason: 'already_warned' };
  }

  const ctx: CapNoticeContext = {
    contractorName: row.contact_name ?? row.business_name,
    analysesUsed: row.analyses_used,
    analysisLimit: row.analysis_limit,
    leadsCaptured: row.leads_captured,
    renewalDate: new Date(row.current_period_end).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    }),
    upgradeUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? '') + '/pricing?plan=operator&from=cap',
  };

  const message = args.kind === 'warning' ? earlyWarningMessage(ctx) : capReachedMessage(ctx);
  const result = await sendBillingEmail({ to: row.email, subject: message.subject, body: message.body });

  if (args.kind === 'warning') {
    await db
      .from('usage_counters')
      .update({ warned_at_20: new Date().toISOString() })
      .eq('prototype_id', args.prototypeId)
      .eq('period_start', row.current_period_start);
  }

  // The admin hot-upsell alert. /admin/billing's "closest to cap" view is the
  // call sheet; this is the push that says look at it today.
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (adminEmail && args.kind === 'reached') {
    await sendBillingEmail({
      to: adminEmail,
      subject: 'HOT UPSELL — ' + row.business_name + ' hit the cap',
      body:
        '**' + row.business_name + '** (' + row.slug + ') reached ' + row.analyses_used + ' of ' +
        row.analysis_limit + ' analyses with ' + row.leads_captured + ' leads captured.\n\n' +
        'Tier: ' + row.plan_code + ' · Period ends ' + ctx.renewalDate + '\n\n' +
        'Contact: ' + (row.contact_name ?? '—') + ' · ' + (row.phone ?? '—') + ' · ' + row.email,
    });
  }

  trackServer(
    'upgrade_viewed',
    { from_plan: row.plan_code === 'operator' ? 'operator' : 'foundation', trigger: args.kind === 'warning' ? 'cap_warning' : 'cap_reached' },
    { surface: 'admin', mode: 'live', prototypeId: args.prototypeId }
  );

  return { sent: result.status === 'sent' };
}
