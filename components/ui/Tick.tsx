/**
 * The atomic graduation mark of the datum rule (DESIGN.md 1.4). Lives in
 * Phase 1 so the widget (Phase 4) and the admin chrome can never drift into
 * two different measurement styles — both compose THIS element from THESE
 * tokens (--tick-* in globals.css).
 */
export function Tick({ major = false }: { major?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block bg-rule"
      style={{
        width: 'var(--tick-w)',
        height: major ? 'var(--tick-major)' : 'var(--tick-minor)',
      }}
    />
  );
}

/** A horizontal run of ticks — the visual signature in its simplest form. */
export function TickStrip({ count = 24 }: { count?: number }) {
  return (
    <div
      aria-hidden
      className="flex items-end"
      style={{ gap: 'var(--tick-gap)' }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Tick key={i} major={i % 6 === 0} />
      ))}
    </div>
  );
}
