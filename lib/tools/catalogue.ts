/**
 * lib/tools/catalogue.ts — the CONTENT of each tool's page.
 *
 * ============================================================================
 * ONE TEMPLATE, DIFFERENT CONTENT, AND A DOOR LEFT OPEN FOR EXCEPTIONS
 * ============================================================================
 *
 * Every tool page is laid out identically: name, media, what it does, how it
 * works, then the calls to action. That sameness is the point — a visitor who
 * has looked at one tool page can read the next one without re-learning it,
 * which is the whole reason a marketplace works.
 *
 * What differs is what is IN each slot, and that lives here rather than in JSX.
 * Adding a tool page is adding an entry to this file. It requires no new
 * component and no new route.
 *
 * EXCEPTIONS ARE EXPLICIT, NOT IMPROVISED. Some tools need a section no other
 * tool needs — the floor coating tool publishes its full pricing arithmetic,
 * and a future tool might need a chart or a calculator nothing else uses. Those
 * are declared as `extras` and the page renders them in a fixed position. The
 * rule this enforces: an exception is a named thing in a list, never a
 * conditional buried in a component. The moment one tool's page starts growing
 * `if (toolId === 'epoxy')` branches inside the JSX, the template is dead.
 *
 * ============================================================================
 * NAMING, AND WHO IS READING
 * ============================================================================
 *
 * The visitor on this page is a CONTRACTOR deciding whether to put this on his
 * website. He is not shopping for "the epoxy AI tool page" — he does not think
 * of his business as an AI use case. So the page is titled with what the thing
 * does for him ("Instant floor quotes on your website"), and the internal id
 * stays `epoxy` for the code.
 *
 * Nothing user-facing on these pages says "AI tool", "module", "vertical" or
 * "unit". Those are our words for our things.
 */

export interface ToolStoryPoint {
  /** The claim, in his language. */
  head: string;
  /** Two or three sentences. Concrete, about his week, not about features. */
  body: string;
  /**
   * A media key from lib/tools/media.ts, or null for a point that carries no
   * image. Null is a real option: a point illustrated by a picture that does
   * not show anything is worse than a point with no picture.
   */
  mediaKey: string | null;
}

/** Sections that exist for one tool and not for others. */
export type ToolExtra = 'pricing-model';

export interface ToolPage {
  /** Matches lib/queue/tools.ts id, and the URL segment. */
  id: string;
  /** The headline. What it does for him, not what it is. */
  title: string;
  /** One sentence under the title. */
  tagline: string;
  /** Two short lines of context above the fold. */
  intro: string;
  storyPoints: ToolStoryPoint[];
  /** Rendered in a fixed slot, after the story and before the CTA block. */
  extras: ToolExtra[];
  /** Tool ids shown in the "others like this" row. Order is meaningful. */
  similar: string[];
  /** Where "Try it out" goes. A real, running surface — never a video. */
  tryHref: string;
}

const EPOXY: ToolPage = {
  id: 'epoxy',
  title: 'Instant floor quotes on your own website',
  tagline:
    'Your customer photographs their garage and gets a real price range in under a minute — from your rates, on your site, with their name and number landing in your inbox either way.',
  intro:
    'It answers the question that decides the job: what is this going to cost me. Whoever answers it first usually wins the work, and right now that is whoever picks up the phone fastest.',
  storyPoints: [
    {
      head: 'They ask at nine at night. It answers at nine at night.',
      body: 'The people pricing a floor are doing it after work, on a phone, comparing three companies at once. A contact form asks them to wait until Tuesday. By Tuesday they have booked somebody else. This gives them a number while they are still looking at you.',
      mediaKey: 'epoxy-widget-quote',
    },
    {
      head: 'They see their own floor finished before they call',
      body: 'The question you answer every week is what will it actually look like. Describing it loses to whoever showed a picture. They send a photo of their garage and get it back with the coating on it — their room, their light, not a gallery of somebody else’s work.',
      mediaKey: 'epoxy-visualiser',
    },
    {
      head: 'You set every number. It never invents one.',
      body: 'Your rate per square foot, your prep charge, your minimum, your adjustments for a cracked or oily slab. You change them from your dashboard in about a minute and the next customer sees the new figures. The price your customer is shown is your price, every time.',
      mediaKey: 'epoxy-rates',
    },
    {
      head: 'You get the lead whether or not they book',
      body: 'Name, phone, the size of the job, the finish they picked and the photo they sent — before they have spoken to anybody. Even the ones who go quiet leave you something you can follow up on next week.',
      mediaKey: 'epoxy-lead',
    },
  ],
  extras: ['pricing-model'],
  similar: ['painting', 'concrete-polishing', 'pressure-washing'],
  tryHref: '/demo',
};

/**
 * Painting is hidden from the public deck by ToolDeck's PUBLIC_TOOLS allowlist,
 * so this page is not linked from anywhere a visitor can reach. It is kept
 * complete and correct so that turning painting on is a one-string change in
 * two places rather than a writing job.
 */
const PAINTING: ToolPage = {
  id: 'painting',
  title: 'Instant repaint quotes on your own website',
  tagline:
    'Wall area, coat count and prep condition in, a real price range out — from your rates, before anybody picks up a phone.',
  intro:
    'Repaint customers shop three quotes and take the one that arrives first. This one arrives while they are still on your site.',
  storyPoints: [
    {
      head: 'A number before the site visit, not after it',
      body: 'Driving out to measure a job you were never going to win is the most expensive hour in the week. A range up front filters the ones who were never serious and warms up the ones who are.',
      mediaKey: null,
    },
    {
      head: 'You set every number. It never invents one.',
      body: 'Your rate per square foot, your coat pricing, your prep adjustments, your minimum. Changed from your dashboard, live for the next customer.',
      mediaKey: null,
    },
  ],
  extras: [],
  similar: ['epoxy'],
  tryHref: '/demo',
};

const PAGES: Record<string, ToolPage> = {
  epoxy: EPOXY,
  painting: PAINTING,
};

/**
 * Returns undefined for a tool with no page written yet, which is most of the
 * nineteen in lib/queue/tools.ts. The route turns that into a 404 rather than
 * rendering a page with empty sections — a tool page with nothing in it reads
 * as a broken product, and there is no version of this that is better than the
 * page simply not existing yet.
 */
export function toolPageFor(toolId: string): ToolPage | undefined {
  return PAGES[toolId];
}

export function toolPageIds(): string[] {
  return Object.keys(PAGES);
}
