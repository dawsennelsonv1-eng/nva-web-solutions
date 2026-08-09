import Link from 'next/link';
import { TOOLS } from '@/lib/queue/tools';
import { toolPageFor } from '@/lib/tools/catalogue';
import type { QueueSections } from '@/lib/queue/data';

/**
 * components/tools/ToolDirectory.tsx — every tool, including the unfinished.
 *
 * ============================================================================
 * THIS IS THE ONE PLACE THAT SHOWS WORK IN PROGRESS
 * ============================================================================
 *
 * The homepage deck is filtered by PUBLIC_TOOLS and shows only what is fully in
 * service. That is right for a front door: a visitor deciding whether this is
 * real should not have to sort finished from unfinished.
 *
 * This page is the opposite, deliberately. Somebody who has scrolled to a
 * directory has already decided the thing is real and is now asking "is there
 * one for me". Hiding a tool that is 80% built answers that question wrongly —
 * it says no when the truthful answer is not yet.
 *
 * ============================================================================
 * THE RED TAG, AND WHAT IT IS ALLOWED TO MEAN
 * ============================================================================
 *
 * A tool that is not finished carries IN TESTING in red and keeps BOTH actions.
 * It can be opened and it can be tried. The tag is information, not a lock.
 *
 * That is a real decision and it cuts against the instinct to disable things.
 * A disabled button on a product you are curious about reads as a wall; a red
 * label on a working one reads as honesty and invites a look. The visitor is
 * told what he is touching and then trusted with it.
 *
 * WHAT THE TAG MAY NEVER DO is appear on something that does not work at all.
 * Status here comes from getQueueSections(), which reconciles the catalogue
 * against the vertical registry — so IN TESTING means genuinely built and
 * genuinely incomplete, never "we have a name for this".
 *
 * ============================================================================
 * WHERE A CARD POINTS
 * ============================================================================
 *
 * A tool with a page in lib/tools/catalogue.ts goes to /tools/[id], where the
 * working tool and its documentation live. A tool without one goes to its spec
 * sheet at /queue/[id], which is a real page with real arithmetic on it.
 *
 * Nothing here links somewhere that does not exist. That is checked at render
 * rather than assumed, because a directory full of dead links is worse than no
 * directory.
 */

export type ToolPhase = 'live' | 'testing' | 'spec';

function phaseOf(id: string, sections: QueueSections): ToolPhase {
  if (sections.inService.some((r) => r.tool.id === id)) return 'live';
  if (sections.inBuild.some((r) => r.tool.id === id)) return 'testing';
  return 'spec';
}

const PHASE_LABEL: Record<ToolPhase, string> = {
  live: 'Ready',
  testing: 'In testing',
  spec: 'Not built yet',
};

export function ToolDirectory({ sections }: { sections: QueueSections }) {
  const cards = TOOLS.map((tool) => {
    const phase = phaseOf(tool.id, sections);
    const page = toolPageFor(tool.id);
    return { tool, phase, hasPage: Boolean(page) };
  });

  return (
    <div className="td-grid">
      {cards.map(({ tool, phase, hasPage }) => {
        const href = hasPage ? `/tools/${tool.id}` : `/queue/${tool.id}`;
        return (
          <article key={tool.id} className={'td-card td-' + phase}>
            <div className="td-head">
              <span className={'td-tag td-tag-' + phase}>{PHASE_LABEL[phase]}</span>
              <span className="tc-unit td-unit">{tool.unit}</span>
            </div>

            <h3 className="td-name">{tool.trade}</h3>
            <p className="td-prices">{tool.prices}</p>

            <div className="td-actions">
              {/* Both actions on every card, including the unfinished ones.
                  The tag says what it is; the buttons still work. */}
              <Link href={href} className="n15-btn n15-btn-primary">
                Try me out
              </Link>
              <Link href={href} className="n15-btn n15-btn-ghost">
                More information
              </Link>
            </div>

            {phase === 'spec' && (
              <p className="td-note">
                No tool yet — the specification and the arithmetic are written
                down and you can read them.
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
