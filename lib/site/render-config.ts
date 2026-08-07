import 'server-only';

/**
 * lib/site/render-config.ts — is the finish visualiser switched on?
 *
 * WHY THIS MODULE EXISTS. components/site/ToolDeck.tsx previously read
 * process.env.OPENROUTER_API_KEY inline. That is a CONVENTIONS.md §4 defect —
 * "No component reads an env var directly. Config arrives as props or from a
 * config module" — and the convention is a good one for a reason that applies
 * exactly here: an env read buried in JSX is invisible to anyone auditing what
 * this deployment is configured to do, and it cannot be tested without setting
 * a real environment.
 *
 * WHAT IT ANSWERS, AND WHAT IT DOES NOT. This is a NECESSARY condition, never a
 * sufficient one. lib/ai/images.ts returns 'not_configured' when the key is
 * absent, so without one every upload would fail politely after a round trip —
 * which is the specific thing this prevents, by letting the card render its
 * invitation visibly inert instead of shipping a button that always fails.
 *
 * A key being present proves nothing about whether a render will succeed. The
 * model slugs can be stale, the prepaid balance can be zero, and the daily
 * ceiling can already be used up. Those are all handled downstream and all
 * produce a real message to the visitor. Do not extend this function to try to
 * predict them: a marketing page that pings a paid provider on every render to
 * decide whether to show a button has invented a new way to spend money.
 *
 * 'server-only' is deliberate. It makes importing this from a client component
 * a build error rather than a silent leak of the key's existence into the
 * browser bundle. The boolean crosses to the client as a prop; the key never
 * does.
 */
export function isVisualiserConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
