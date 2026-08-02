/**
 * components/ui/Plate.tsx — THE SIGNATURE ELEMENT.
 *
 * A stamped equipment nameplate: the riveted plate on the side of a
 * compressor, not a badge and not a chip. Every real thing on this site wears
 * one, and the Plate is the mechanism that makes the design system incapable
 * of overstating what exists. Signature and honesty device are the same
 * object; that is the whole idea.
 *
 * HOW THE CONSTRAINTS ARE ENFORCED RATHER THAN DOCUMENTED:
 *
 *  1. STATUS IS A CLOSED UNION. Four values. A fifth is a TypeScript error at
 *     the call site, not a runtime surprise. `INDICATOR` is a Record keyed by
 *     that union, so adding a status without deciding its dot rule also fails
 *     to compile. There is no way to invent `LAUNCHING SOON`.
 *
 *  2. ALL FOUR FIELDS ARE REQUIRED. unit, status, rev, date and count are
 *     non-optional props. A Plate cannot be rendered with the awkward field
 *     left off — if a thing has no deploys, it says `DEPLOYS 0`, in the open.
 *     Omitting a field is how marketing pages lie by shape rather than by
 *     statement, so the type system removes the option.
 *
 *  3. THERE IS NO `className` PROP, AND NO `style` PROP. This is the reason
 *     the component takes no escape hatch: 13A requires the Plate is never
 *     centred, never shadowed, never re-radiused, and always top-left aligned
 *     to the module it labels. A className prop would make every one of those
 *     rules a matter of discipline at ~30 call sites. Without it they are
 *     properties of the component. Positioning is the parent's job — wrap it.
 *
 *  4. NO SHADOW IS POSSIBLE. `shadow-*` no longer exists in the Tailwind
 *     theme (tailwind.config.ts note 2), so it could not be added here even
 *     by accident.
 *
 * The date field is passed in, never derived from `new Date()`. A Plate that
 * silently reports the current month would claim a revision that may not have
 * happened — the exact failure this component exists to prevent.
 */

export type PlateStatus = 'IN SERVICE' | 'IN BUILD' | 'QUEUED' | 'SPEC ONLY';

/**
 * Dot colour per status. Keyed by the union, so the compiler requires a
 * decision here before a new status can exist anywhere.
 *
 * Gauge Green means measured and in service. Signal Orange means currently
 * happening. QUEUED and SPEC ONLY get no dot at all — an unlit indicator is
 * the honest rendering of a thing that is not running, and it reads correctly
 * at a glance on a phone in daylight.
 */
const INDICATOR: Record<PlateStatus, 'cure' | 'hazard' | null> = {
  'IN SERVICE': 'cure',
  'IN BUILD': 'hazard',
  QUEUED: null,
  'SPEC ONLY': null,
};

export interface PlateProps {
  /** Unit designator, e.g. NVA-EPX-01. Uppercase is applied, not assumed. */
  unit: string;
  status: PlateStatus;
  /** Revision number. Integer; rendered as REV n. */
  rev: number;
  /** Revision date as YYYY-MM. Passed in, never derived from the clock. */
  date: string;
  /** The live count field: its label and its value. Zero is a valid value. */
  count: { label: string; value: number };
}

export function Plate({ unit, status, rev, date, count }: PlateProps) {
  const indicator = INDICATOR[status];

  return (
    <dl
      className="inline-block rounded-none border border-rule bg-sheet px-2.5 py-2 text-left font-data text-2xs uppercase leading-4 tracking-[0.08em] text-ink"
      aria-label={`Unit ${unit}, status ${status}`}
    >
      {/* Field 1 — unit designator */}
      <dt className="sr-only">Unit</dt>
      <dd className="tabular">{unit}</dd>

      {/* Field 2 — status. The dot is a 6px LED, the one round thing in the
          system. When a status has no dot, a same-width spacer holds the
          column so the four fields stay left-aligned to each other. */}
      <dt className="sr-only">Status</dt>
      <dd className="mt-1 flex items-center gap-1.5">
        {indicator ? (
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              indicator === 'cure' ? 'bg-cure' : 'bg-hazard'
            }`}
          />
        ) : (
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0" />
        )}
        <span>{status}</span>
      </dd>

      {/* Field 3 — revision and date */}
      <dt className="sr-only">Revision</dt>
      <dd className="mt-1 tabular text-rule">
        REV {rev} · {date}
      </dd>

      {/* Field 4 — live count */}
      <dt className="sr-only">{count.label}</dt>
      <dd className="mt-1 tabular text-rule">
        {count.label.toUpperCase()} {count.value}
      </dd>
    </dl>
  );
}
