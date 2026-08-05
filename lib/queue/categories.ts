import { TOOLS } from '@/lib/queue/tools';

/**
 * lib/queue/categories.ts — GROUPING FOR /categories.
 *
 * The queue page answers "when is my trade getting built". This answers a
 * different and earlier question: "is my trade here at all". A man arriving
 * from a paid feed does not know the catalogue, does not want a schedule, and
 * will not read nineteen rows to find out whether roofing is on the list. He
 * needs to find his own trade in one tap.
 *
 * WHY THE MAPPING LIVES HERE AND NOT AS A FIELD ON Tool: adding `category` to
 * the Tool interface would mean editing nineteen entries in the catalogue for
 * a property that describes how this ONE page arranges them. The catalogue
 * describes trades; this file describes a view. If a second view ever wants a
 * different grouping — by ticket size, by season, by whether the trade quotes
 * from a photo — it gets its own file rather than a second field nobody else
 * uses.
 *
 * THE GUARD BELOW IS THE POINT. `assertCategories()` fails loudly if any tool
 * in the catalogue has no category. Without it, adding tool number twenty
 * would silently drop it from this page — the trade would exist in the queue,
 * be votable, have a spec sheet, and be invisible to every visitor who came
 * here looking for it. A missing entry is exactly the kind of omission nobody
 * notices for months, so it is made impossible instead.
 */

export interface Category {
  id: string;
  label: string;
  /** One line, plain. Not a value proposition — a description of the group. */
  blurb: string;
  toolIds: string[];
}

/**
 * Grouped by what a contractor's TRUCK does, not by an industry taxonomy. A
 * man who coats floors and pours flatwork thinks of those as the same business
 * even though a trade association would not.
 */
export const CATEGORIES: Category[] = [
  {
    id: 'floors',
    label: 'Floors and flatwork',
    blurb: 'Trades priced by the square foot of a horizontal surface.',
    toolIds: ['epoxy', 'concrete-flatwork', 'tile'],
  },
  {
    id: 'envelope',
    label: 'Roof, walls and openings',
    blurb: 'The outside shell — what keeps weather out of the building.',
    toolIds: ['roofing', 'siding', 'gutters', 'windows', 'garage-doors'],
  },
  {
    id: 'interior',
    label: 'Interior finish',
    blurb: 'Work priced by wall area, coat count and prep condition.',
    toolIds: ['painting', 'drywall', 'insulation'],
  },
  {
    id: 'grounds',
    label: 'Grounds and outdoor structures',
    blurb: 'Everything priced by linear foot, by area of yard, or by the tree.',
    toolIds: ['fencing', 'decks', 'landscaping-sod', 'tree-service', 'pressure-washing'],
  },
  {
    id: 'systems',
    label: 'Systems',
    blurb: 'Priced by capacity and by what the existing equipment will accept.',
    toolIds: ['hvac', 'electrical-panel'],
  },
  {
    id: 'site',
    label: 'Site services',
    blurb: 'Priced by volume hauled and by access to the load.',
    toolIds: ['junk-removal'],
  },
];

/**
 * Fails the build if the catalogue and this file disagree in either direction.
 * Called at module scope by the categories page, so a mismatch is a server
 * error on that route rather than a silently short list.
 */
export function assertCategories(): void {
  const catalogued = new Set(TOOLS.map((t) => t.id));
  const grouped = new Set<string>();

  for (const c of CATEGORIES) {
    for (const id of c.toolIds) {
      if (!catalogued.has(id)) {
        throw new Error(
          `categories.ts: category '${c.id}' lists unknown tool '${id}'. ` +
            'It is not in lib/queue/tools.ts.'
        );
      }
      if (grouped.has(id)) {
        throw new Error(`categories.ts: tool '${id}' appears in more than one category.`);
      }
      grouped.add(id);
    }
  }

  const missing = [...catalogued].filter((id) => !grouped.has(id));
  if (missing.length > 0) {
    throw new Error(
      `categories.ts: these tools have no category and would be invisible on ` +
        `/categories: ${missing.join(', ')}. Add each to a category above.`
    );
  }
}

/**
 * Where a tool's LIVE demo lives, or null if it has none.
 *
 * This is a lookup rather than a template because there is currently exactly
 * one demo surface and it is hardwired to epoxy: lib/demo/config.ts sets
 * DEMO_VERTICAL = 'epoxy', so /demo prices garage floors regardless of which
 * tool a visitor clicked to get there.
 *
 * That matters more than it looks. lib/queue/data.ts promotes any REGISTERED
 * vertical to IN SERVICE, and painting is registered — so painting resolves to
 * IN SERVICE and its Plate says so truthfully, because the module really can
 * price a repaint. But there is no public surface that runs it. Sending a
 * painter to /demo would show him an epoxy quote under a painting heading,
 * which is the single most damaging thing this page could do to a visitor who
 * came looking for his own trade.
 *
 * So a tool with no demo href routes to its spec sheet and says why, and the
 * day a painting surface exists this map gains one line.
 */
const DEMO_HREF: Readonly<Record<string, string>> = {
  epoxy: '/demo',
};

export function demoHrefFor(toolId: string): string | null {
  return DEMO_HREF[toolId] ?? null;
}
