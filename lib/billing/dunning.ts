import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendBillingEmail } from '@/lib/notify/email';
import { trackServer } from '@/lib/analytics.server';
import { dueDunningDay, dunningMessage, isSendableDay, type DunningDay } from './dunningRules';

/**
 * lib/billing/dunning.ts — the impure half of the dunning machine: reads
 * subscriptions, sends, and logs. The decision logic it calls
 * (dueDunningDay / isSendableDay / dunningMessage) is pure and unit-tested
 * in ./dunningRules.ts.
 *
 * Re-exported below so existing call sites keep importing from one place.
 */

export * from './dunningRules';

function daysSince(from: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(from).getTime()) / 86_400_000);
}

export interface DunningRunResult {
  examined: number;
  sent: { subscriptionId: string; day: DunningDay; channels: string[] }[];
  suspended: string[];
  skipped: string[];
}

/**
 * One pass of the dunning clock. Idempotent and safe to run repeatedly —
 * intended to be called daily by app/api/cron/dunning/route.ts.
 */
export async function runDunningPass(now: Date = new Date()): Promise<DunningRunResult> {
  const db = getSupabaseAdminClient();
  const result: DunningRunResult = { examined: 0, sent: [], suspended: [], skipped: [] };

  const { data: subs, error } = await db
    .from('subscriptions')
    .select('id, prototype_id, prospect_id, status, grace_ends_at, current_period_end')
    .in('status', ['past_due', 'grace']);
  if (error || !subs) return result;

  result.examined = subs.length;
  const sendable = isSendableDay(now);
  const updateCardUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '') + '/admin/billing';
  const adminPhone = process.env.ADMIN_NOTIFY_PHONE ?? '';
  const adminName = process.env.ADMIN_NOTIFY_NAME ?? 'Dawsen';

  for (const sub of subs) {
    // grace_ends_at is stamped at day 0 by the webhook, so the clock has a
    // fixed origin that does not drift with when this cron happens to run.
    if (!sub.grace_ends_at) {
      result.skipped.push(sub.id);
      continue;
    }
    const dayZero = new Date(new Date(sub.grace_ends_at).getTime() - 10 * 86_400_000).toISOString();
    const elapsed = daysSince(dayZero, now);

    const { data: sentRows } = await db
      .from('dunning_events')
      .select('day_number')
      .eq('subscription_id', sub.id);
    const alreadySent = (sentRows ?? []).map((r) => r.day_number as DunningDay);

    const due = dueDunningDay(elapsed, alreadySent);
    if (due === null) {
      result.skipped.push(sub.id);
      continue;
    }

    // Day 10 flips to suspended even on a Sunday — the STATE change is not a
    // message, and holding it back would silently extend the grace period.
    // Only the notification waits for a sendable day.
    if (due === 10) {
      await db
        .from('subscriptions')
        .update({ status: 'suspended' })
        .eq('id', sub.id);
      await db
        .from('prototypes')
        .update({ subscription_status: 'suspended' })
        .eq('id', sub.prototype_id);
      result.suspended.push(sub.id);
      trackServer(
        'subscription_suspended',
        { days_in_dunning: elapsed },
        { surface: 'admin', mode: 'live', prototypeId: sub.prototype_id }
      );
    } else if (sub.status === 'past_due' && elapsed >= 7) {
      await db.from('subscriptions').update({ status: 'grace' }).eq('id', sub.id);
    }

    if (!sendable) {
      result.skipped.push(sub.id);
      continue;
    }

    const { data: prospect } = await db
      .from('prospects')
      .select('business_name, contact_name, email')
      .eq('id', sub.prospect_id)
      .maybeSingle();
    if (!prospect?.email) {
      result.skipped.push(sub.id);
      continue;
    }

    const { data: counter } = await db
      .from('usage_counters')
      .select('leads_captured')
      .eq('prototype_id', sub.prototype_id)
      .order('period_start', { ascending: false })
      .limit(1);

    const dayTen = new Date(sub.grace_ends_at);
    const message = dunningMessage(due, {
      contractorName: prospect.contact_name ?? prospect.business_name,
      siteLabel: prospect.business_name,
      updateCardUrl,
      dayTenDate: dayTen.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
      leadsSinceFailure: counter?.[0]?.leads_captured ?? 0,
      adminPhone,
      adminName,
    });

    const channels: string[] = [];
    const emailResult = await sendBillingEmail({
      to: prospect.email,
      subject: message.subject,
      body: message.body,
    });
    if (emailResult.status === 'sent') channels.push('email');

    await db.from('dunning_events').insert({
      subscription_id: sub.id,
      day_number: due,
      channel: 'email',
      delivery_status: emailResult.status,
    });
    trackServer(
      'dunning_sent',
      { day_number: due, channel: 'email' },
      { surface: 'admin', mode: 'live', prototypeId: sub.prototype_id }
    );

    // SMS on days 7 and 10 per OFFER.md. No SMS provider is wired yet
    // (ENV.md marks SMS_PROVIDER_KEY as pending), so the send is recorded as
    // skipped rather than silently claimed — delivery_status must reflect
    // reality or the admin view lies about what the contractor received.
    if (message.sms) {
      await db.from('dunning_events').insert({
        subscription_id: sub.id,
        day_number: due,
        channel: 'sms',
        delivery_status: process.env.SMS_PROVIDER_KEY ? 'pending_provider' : 'skipped_not_configured',
      });
      trackServer(
        'dunning_sent',
        { day_number: due, channel: 'sms' },
        { surface: 'admin', mode: 'live', prototypeId: sub.prototype_id }
      );
    }

    result.sent.push({ subscriptionId: sub.id, day: due, channels });
  }

  return result;
}
