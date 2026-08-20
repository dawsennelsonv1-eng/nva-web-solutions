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
  /* Two real tools rather than two real and one aspirational. The row
     previously listed 'concrete-polishing' and 'pressure-washing', neither of
     which has a page — a link to a tool that does not exist is worse than a
     shorter row. */
  similar: ['painting', 'landscaping'],
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
  similar: ['cabinets', 'epoxy', 'landscaping'],
  tryHref: '/demo',
};


const LANDSCAPING: ToolPage = {
  id: 'landscaping',
  title: 'Show them the finished yard, then price it',
  tagline:
    'A homeowner sends one photo of their yard, picks a style, and sees it built — with a real range from your rates underneath it.',
  intro:
    'Nobody can picture a patio from a description. This one shows them their own yard finished, while they are still standing in it.',
  storyPoints: [
    {
      head: 'The photograph does the selling',
      body: 'A yard is the hardest job in the trade to sell on paper, because the customer is being asked to imagine the one thing they cannot picture. Showing them their own space finished ends that conversation before it starts.',
      mediaKey: null,
    },
    {
      head: 'What is already there is priced, not ignored',
      body: 'Tearing out a slab is thousands of dollars of machine time and dump fees, and it is the line every rough estimate forgets. This one asks what is on the ground and prices removal separately, so the range is not one you have to walk back on site.',
      mediaKey: null,
    },
    {
      head: 'You set every rate. It never invents one.',
      body: 'Your rate per square foot for each style, your clearing rates, your access and slope adjustments, your minimum. Changed from your dashboard, live for the next customer.',
      mediaKey: null,
    },
  ],
  howItWorks: [
    {
      head: 'They send one photo of the yard',
      body: 'One wide shot from a door or a corner. A fence or the house in frame is what it measures against. They do not need to tidy up first, and they do not need to measure anything.',
      mediaKey: null,
    },
    {
      head: 'They pick what it should become',
      body: 'Paver patio, flagstone, artificial turf, gravel and drought planting, lawn and beds, or a deck with a pergola. Then the material tone.',
      mediaKey: null,
    },
    {
      head: 'They see their own yard, finished',
      body: 'Not a stock photo of somebody else\u2019s garden. Their yard, with the style they chose on it.',
      mediaKey: null,
    },
    {
      head: 'It prices the job from your rates',
      body: 'Area times your rate for that style, plus clearing what is there now, plus grading where it is needed. Your minimum, your mobilisation, your range.',
      mediaKey: null,
    },
  ],
  features: [
    {
      head: 'The quote survives the site visit',
      body: 'Clearing, access and slope are priced up front instead of discovered later, so the number you gave is close to the number you sign.',
    },
    {
      head: 'It filters before you drive',
      body: 'A homeowner who wanted flagstone and sees the flagstone range self-selects. The ones who book a visit have already accepted the number.',
    },
    {
      head: 'Every rate is yours',
      body: 'Six styles, four clearing levels, five site adjustments and a minimum. All editable, none guessed.',
    },
  ],
  faq: [
    {
      q: 'How accurate is the size from one photo?',
      a: 'Close enough to quote a range, and it tells you when it is not sure. Everything here is area times a rate, so when the photo does not give it enough to go on it says so and asks for the size instead of guessing.',
    },
    {
      q: 'Does the render show real materials?',
      a: 'It shows the style and tone they chose on their own yard. It is an illustration of the finish, not a photograph of the work you will do \u2014 and it says so on the page, beside the picture.',
    },
    {
      q: 'What if the yard needs a retaining wall?',
      a: 'There is an adjustment for it, and the estimate says plainly that ground conditions are only fully known on site. The tool is built to hand you a warm lead, not to commit you to a number you have not seen.',
    },
    {
      q: 'How do I put it on my site?',
      a: 'One line of code. If somebody else built your site, send them the line or send it to us.',
    },
  ],
  reviews: [],
  extras: ['live-widget'],
  /* Epoxy first: a contractor reading about yards is often the same person who
     does garage floors, and it is the tool with the most finished surface to
     show. */
  similar: ['fencing', 'epoxy', 'painting'],
  tryHref: '/demo',
};


const CABINETS: ToolPage = {
  id: 'cabinets',
  title: 'Show them the kitchen, then price it by the door',
  tagline:
    'A homeowner sends one photo. It counts the doors and drawers, shows the cabinets in the colour they picked, and prices it from your per-door rates.',
  intro:
    'A repainted kitchen is the before-and-after everybody shares. This one shows them theirs, and quotes it while they are still looking at it.',
  storyPoints: [
    {
      head: 'It counts the doors so they do not have to',
      body: 'The number that decides the price is the one no homeowner knows. Asking them to count 30 fronts loses half of them; counting it from their photo and letting them correct it keeps them.',
      mediaKey: null,
    },
    {
      head: 'Oak grain is priced, not discovered on site',
      body: 'Open-grain oak painted white without filling still reads as oak, and the customer finds out six weeks later. Filling it is real labour on every front, so it is a line in the quote instead of a conversation you have to have after quoting.',
      mediaKey: null,
    },
    {
      head: 'Per door, per drawer, per foot of box \u2014 your rates',
      body: 'Five finish levels from brushed to catalysed varnish, three prep grades, and adjustments for grease, glass and water damage. All yours, all editable.',
      mediaKey: null,
    },
  ],
  howItWorks: [
    {
      head: 'They send one photo of the kitchen',
      body: 'One wide shot with as many doors in frame as they can get. It counts what it can see and says so when some are cut off.',
      mediaKey: null,
    },
    {
      head: 'They pick the finish and the colour',
      body: 'Brushed, sprayed lacquer, conversion varnish, stripped and restained, or painted with a glaze. Then the colour.',
      mediaKey: null,
    },
    {
      head: 'They see their own kitchen in it',
      body: 'Their cabinets, their room, the colour they chose \u2014 not a showroom photo of somebody else\u2019s kitchen.',
      mediaKey: null,
    },
    {
      head: 'It prices it per front from your rates',
      body: 'Doors, drawer fronts, boxes in place, prep by condition, and your minimum. The figure is yours.',
      mediaKey: null,
    },
  ],
  features: [
    {
      head: 'The count is the quote, and it is checkable',
      body: 'A homeowner looking at his own kitchen will spot a missing four doors immediately. That makes the one number everything rests on the easiest one to verify.',
    },
    {
      head: 'It quotes the small jobs too',
      body: 'A single vanity prices sensibly instead of hitting a kitchen-sized minimum. Raise the minimum in your dashboard if you would rather not take them.',
    },
    {
      head: 'Every rate is yours',
      body: 'Per door, per drawer, per linear foot of box, per front of prep. None of it guessed.',
    },
  ],
  faq: [
    {
      q: 'What if it counts the doors wrong?',
      a: 'They correct it, and it is built to be corrected \u2014 it counts only what is actually visible rather than estimating what is round the corner, so it undercounts rather than overcounts. An undercount is obvious to somebody standing in their own kitchen.',
    },
    {
      q: 'Does it handle laminate doors?',
      a: 'It looks for them, because laminate and thermofoil cannot be stripped and restained at all. When it cannot tell wood from a wood-look laminate it says so rather than guessing, and the estimate notes that it is confirmed on site.',
    },
    {
      q: 'Why is oak more expensive?',
      a: 'The grain has to be filled before painting or it prints through the finish. That is labour on every single front, which is why it is the largest adjustment in the tool and why it is priced up front instead of after.',
    },
    {
      q: 'How do I put it on my site?',
      a: 'One line of code. If somebody else built your site, send them the line or send it to us.',
    },
  ],
  reviews: [],
  extras: ['live-widget'],
  similar: ['painting', 'epoxy'],
  tryHref: '/demo',
};


const FENCING: ToolPage = {
  id: 'fencing',
  title: 'Show them the fence on their own house',
  tagline:
    'A homeowner sends one photo of the boundary, picks a style, and sees that fence standing on their property \u2014 with a price from your per-foot rates.',
  intro:
    'A fence is bought on how it looks from the kitchen window. Nobody can picture that from a brochure, so this shows them theirs.',
  storyPoints: [
    {
      head: 'They see it on their own boundary',
      body: 'Not a catalogue photo of a fence in somebody else\u2019s garden. Their house, their line, the style they picked \u2014 which is the difference between a quote they think about and a quote they show their partner.',
      mediaKey: null,
    },
    {
      head: 'Rock is priced, not discovered',
      body: 'Caliche and limestone shelf are everywhere in this market, and setting posts in rock is the most under-quoted condition in the trade. The tool looks for it and prices it before you commit to a number.',
      mediaKey: null,
    },
    {
      head: 'Seven styles across a tenfold spread',
      body: 'Chain link to stone columns. Each with your rate per foot, your gate prices, your removal cost and your minimum.',
      mediaKey: null,
    },
  ],
  howItWorks: [
    {
      head: 'They send one photo down the line',
      body: 'A side boundary, the back of the yard, or the front of the house. The house or a car in frame gives it something to judge distance against.',
      mediaKey: null,
    },
    {
      head: 'They pick the fence',
      body: 'Chain link, cedar privacy, board on board with steel posts, horizontal slat, vinyl, ornamental metal, or stone columns with panels. Then the finish.',
      mediaKey: null,
    },
    {
      head: 'They see it standing there',
      body: 'On their property, in the style and finish they chose.',
      mediaKey: null,
    },
    {
      head: 'It prices the run from your rates',
      body: 'Length times your rate, plus gates as pieces, plus taking the old fence out. Your minimum, your mobilisation, your range.',
      mediaKey: null,
    },
  ],
  features: [
    {
      head: 'Gates are priced as gates',
      body: 'A drive gate is a fabrication problem, not twelve feet of fence. Charging it by the foot is how quotes go wrong on the jobs that matter most.',
    },
    {
      head: 'It filters before you drive out',
      body: 'Somebody who wanted stone columns and sees the stone column range self-selects. The ones who book have accepted the number.',
    },
    {
      head: 'Every rate is yours',
      body: 'Per foot by style, per gate, per foot of removal, and five site adjustments. None of it guessed.',
    },
  ],
  faq: [
    {
      q: 'How does it know how long the run is?',
      a: 'It estimates from your photo, using the house, a car or a garage door for scale \u2014 and it tells you when it is not sure rather than guessing, because a boundary that recedes from the camera is easy to underestimate. You can always type the length instead.',
    },
    {
      q: 'What about rocky ground?',
      a: 'It is an adjustment in the quote, and the tool looks for visible rock in the photo. In this market that is the difference between augering a post hole and coring one, and it is the line most estimates leave out.',
    },
    {
      q: 'Does it handle taking the old fence out?',
      a: 'Yes, as its own line charged on the full run. When the photo shows an existing fence it suggests it, and the homeowner can turn it off.',
    },
    {
      q: 'How do I put it on my site?',
      a: 'One line of code. If somebody else built your site, send them the line or send it to us.',
    },
  ],
  reviews: [],
  extras: ['live-widget'],
  similar: ['landscaping', 'epoxy'],
  tryHref: '/demo',
};

const PAGES: Record<string, ToolPage> = {
  epoxy: EPOXY,
  painting: PAINTING,
  landscaping: LANDSCAPING,
  cabinets: CABINETS,
  fencing: FENCING,
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
