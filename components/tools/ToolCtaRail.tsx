'use client';

import Link from 'next/link';

/**
 * components/tools/ToolCtaRail.tsx — the two actions, kept within reach.
 *
 * ============================================================================
 * IT IS A REPEATED BLOCK, NOT A STICKY BAR
 * ============================================================================
 *
 * The brief asked that once somebody has tried the tool, the buy action and the
 * more-information action be obvious and present almost everywhere on the page.
 *
 * That is done by placing this block at each natural decision point — after the
 * showcase, after the story, after the pricing, after the related tools — and
 * not by pinning a bar to the bottom of the screen.
 *
 * A fixed bar costs 64px of a 360px-wide phone permanently. On a page whose job
 * is to be read, that is the worst possible 12% to give up, and it lands
 * directly over the thumb rest. It also fights the fixed 56px header for the
 * same small screen. The repeated block costs nothing when the visitor is
 * reading and is never more than a short scroll away when he decides.
 *
 * ============================================================================
 * TWO ACTIONS, AND THE SECOND ONE IS NOT A MEETING
 * ============================================================================
 *
 * "Try me out" goes to the running tool. "Get this on my site" goes to the
 * intake questionnaire rather than to a calendar, which is the brief's own
 * instruction and a good one: a booking link asks a stranger to give up half an
 * hour before he knows what he is getting, and it loses the ones who would
 * rather type than talk.
 *
 * VERIFY: the intake route does not exist yet — see the note in the tool page.
 * Until it ships, `intakeHref` is pointed at /pricing by the page so the button
 * lands somewhere real. A button that 404s is worse than a button that goes
 * somewhere slightly wrong.
 *
 * `emphasis` exists so the same component can lead with either action. Above
 * the fold the visitor has not tried anything yet, so trying is the primary
 * action; after the story he has seen what it does, so getting it is.
 */

export interface ToolCtaRailProps {
  tryHref: string;
  intakeHref: string;
  emphasis: 'try' | 'buy';
  /** Optional line above the buttons. Keep it to one sentence. */
  note?: string;
}

export function ToolCtaRail({ tryHref, intakeHref, emphasis, note }: ToolCtaRailProps) {
  const tryClass = 'n15-btn ' + (emphasis === 'try' ? 'n15-btn-primary' : 'n15-btn-ghost');
  const buyClass = 'n15-btn ' + (emphasis === 'buy' ? 'n15-btn-primary' : 'n15-btn-ghost');

  return (
    <div className="cta-rail">
      {note && <p className="cta-note">{note}</p>}
      <div className="cta-actions">
        <Link href={tryHref} className={tryClass}>
          Try me out
        </Link>
        <Link href={intakeHref} className={buyClass}>
          Get this on my site
        </Link>
      </div>
    </div>
  );
}
