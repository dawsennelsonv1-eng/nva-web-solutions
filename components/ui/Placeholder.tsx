/**
 * Phase 1 placeholder discipline: every route body renders its own name and
 * props as JSON (master prompt, Phase 1). No visual design work here — the
 * theme engine is proven by the tokens this consumes, not by styling effort.
 */
export function Placeholder({
  name,
  props,
}: {
  name: string;
  props?: unknown;
}) {
  return (
    <section className="mx-auto max-w-2xl p-4">
      <div className="rounded-milled border bg-sheet p-4">
        <p className="font-data text-xs text-rule">PLACEHOLDER</p>
        <h1 className="font-display font-condensed text-2xl font-bold">{name}</h1>
        <pre className="tabular mt-3 overflow-x-auto font-data text-sm">
          {JSON.stringify(props ?? {}, null, 2)}
        </pre>
      </div>
    </section>
  );
}
