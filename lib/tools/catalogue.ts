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
 * 'live-widget' mounts components/demo/DemoExperience — the four-step widget
 * that used to live at /demo. It is an extra rather than part of the template
 * because it is the epoxy funnel specifically; another tool's live surface will
 * be its own module, not this one.
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
export type ToolExtra = 'pricing-model' | 'live-widget';

/** One step of "how it works", shown in order with its own frame. */
export interface ToolStep {
  head: string;
  body: string;
  mediaKey: string | null;
}

/** A benefit, stated as an outcome rather than a capability. */
export interface ToolFeature {
  head: string;
  body: string;
}

export interface ToolFaqItem {
  q: string;
  a: string;
}

/**
 * A real review from a real customer, or nothing.
 *
 * THE ARRAY IS EMPTY AND IT STAYS EMPTY UNTIL SOMEBODY SAYS SOMETHING. Writing
 * three plausible testimonials here would be the single most damaging thing
 * that could be done to this site: it is the one place arguing that every
 * number on it is real and checkable, and a contractor who suspects one fake
 * review stops believing the pricing table too.
 *
 * The section renders an honest empty state instead, which is a far better look
 * for one quarter than a fabricated one is forever.
 */
export interface ToolReview {
  quote: string;
  name: string;
  business: string;
  city: string;
  /** ISO date. Shown so the reader can see it is not ancient. */
  date: string;
}

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
  /** How it works, in order. The reader is deciding whether he could run it. */
  howItWorks: ToolStep[];
  /** Benefits. Outcomes in his week, never capability lists. */
  features: ToolFeature[];
  /** Questions about using it, not about buying it. Buying is on /pricing. */
  faq: ToolFaqItem[];
  /** Real ones only. Empty renders an honest empty state. */
  reviews: ToolReview[];
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
  howItWorks: [
    {
      head: 'They land on your site and see a price control, not a form',
      body: 'It sits on the page you already have, in your colours. Nothing to download and no account to make — the first thing they can do is start answering.',
      mediaKey: 'epoxy-widget-mobile',
    },
    {
      head: 'They send one photo of the floor',
      body: 'The camera opens on their phone. They do not need to measure anything or tidy up, which is the whole reason this works: most people have no idea what their garage is in square feet, and asking is where they leave.',
      mediaKey: 'epoxy-visualiser',
    },
    {
      head: 'It reads the photo and works out the size',
      body: 'The model estimates the floor area and the condition of the slab. If it is confident it says so and shows the number; if it is not, it asks. Either way they can correct it with one tap.',
      mediaKey: 'epoxy-widget-quote',
    },
    {
      head: 'It prices the job from your rates',
      body: 'Your rate per square foot, your prep charge, your adjustments, your minimum. The AI never sets a price and never adjusts one — it only reads the photo. The number is yours.',
      mediaKey: 'epoxy-rates',
    },
    {
      head: 'The lead reaches you either way',
      body: 'Name, phone, floor size, chosen finish and the photo they sent — whether or not they book. Even the ones who go quiet leave you something worth a call next week.',
      mediaKey: 'epoxy-lead',
    },
  ],
  features: [
    {
      head: 'You stop losing the nine-o-clock jobs',
      body: 'People price floors after work, comparing three companies at once. A contact form asks them to wait until Tuesday, and by Tuesday they have booked somebody else.',
    },
    {
      head: 'You stop driving out to measure jobs you were never going to win',
      body: 'A range up front filters the ones who were never serious. The site visits you do make are for people who already know roughly what this costs.',
    },
    {
      head: 'You answer "what will it look like" with a picture',
      body: 'Describing a metallic finish loses to whoever showed one. They see their own floor, in their own light, before they call you.',
    },
    {
      head: 'You change your prices in a minute, from your phone',
      body: 'Material goes up, you change one number in the dashboard, and the next customer sees the new figure. No developer and no waiting.',
    },
    {
      head: 'Nothing is taken out of what you invoice',
      body: 'A setup fee and a monthly fee. No share of a job, no commission on a lead, no percentage of anything, for as long as you stay.',
    },
  ],
  faq: [
    {
      q: 'What if the AI gets the size wrong?',
      a: 'Your customer can correct it with one tap, and the control is right under the estimate. The estimate is a starting point that saves them measuring, not a measurement — and you confirm the real number on site before any work is agreed.',
    },
    {
      q: 'Do I have to use the photo part?',
      a: 'No. There is a plain "enter the size yourself" option on every quote, and the pricing works exactly the same without a photo. The photo just makes it faster and lets them see the finish.',
    },
    {
      q: 'Where do the prices come from?',
      a: 'A rate table you own and edit — rate per square foot for each finish, prep charge, condition adjustments, mobilisation and your job minimum. The whole calculation is published further down this page so you can check it against a job you have already done.',
    },
    {
      q: 'Can my customer see a price I would not honour?',
      a: 'Only if your rate table says so. It quotes a range around the midpoint and never goes below your minimum, and any job outside the size range you set is handed to you as a lead instead of being guessed at.',
    },
    {
      q: 'What happens to the photos people send?',
      a: 'They are stored so you have a record of what was quoted, and deleted automatically on a schedule. They are not used to train anything.',
    },
    {
      q: 'How do I put it on my site?',
      a: 'One line of code where you want it to appear. If somebody else built your site, send them the line — or send it to us and we will do it and show you the confirmation.',
    },
    {
      q: 'What if I do not like it?',
      a: 'We build the branded version and send you a link before you pay anything. After that, tell us inside 30 days and the setup fee comes back in full, and you keep any leads it captured.',
    },
  ],
  reviews: [],
  extras: ['live-widget', 'pricing-model'],
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
  howItWorks: [
    {
      head: 'They land on your site and see a price control',
      body: 'In your colours, on the page you already have. Nothing to download and no account to make.',
      mediaKey: null,
    },
    {
      head: 'They describe the walls',
      body: 'Wall area, how many coats, and what condition the surface is in. Three questions, all of which a homeowner can actually answer.',
      mediaKey: null,
    },
    {
      head: 'It prices the job from your rates',
      body: 'Your rate per square foot, your coat pricing, your prep adjustments and your minimum. The figure is yours.',
      mediaKey: null,
    },
  ],
  features: [
    {
      head: 'A number before the site visit, not after it',
      body: 'Driving out to measure a job you were never going to win is the most expensive hour in the week.',
    },
    {
      head: 'You set every number',
      body: 'Changed from your dashboard, live for the next customer.',
    },
  ],
  faq: [
    {
      q: 'Where do the prices come from?',
      a: 'A rate table you own and edit. The AI never sets a price.',
    },
    {
      q: 'How do I put it on my site?',
      a: 'One line of code. If somebody else built your site, send them the line or send it to us.',
    },
  ],
  reviews: [],
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
