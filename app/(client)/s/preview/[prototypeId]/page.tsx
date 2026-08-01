import { notFound, redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/admin';
import { resolvePrototypeForPreview } from '@/lib/combiner/resolvePreview';
import { tokensToCssVars, type DerivedTokens } from '@/lib/brand/tokens';
import { PrototypeView } from '@/components/prototype/PrototypeView';
import { PreviewRefreshListener } from '@/components/prototype/PreviewRefreshListener';

/**
 * app/(client)/s/preview/[prototypeId]/page.tsx — THE COMBINER'S IFRAME
 * TARGET. Admin-only (requireAdmin(), not a secret token — see
 * 0009_combiner.sql's header for why that's the right call here), renders
 * PrototypeView — the SAME component the real /s/[slug] route renders —
 * fed by lib/combiner/resolvePreview.ts's merge of saved + staged data.
 *
 * Deliberately in the (client) route group despite being admin-gated: it
 * needs to render exactly like a client prototype page (theme scope, brand
 * variables, no admin chrome), which is the entire point — the combiner
 * needs to see what a contractor would see, not what an admin page looks
 * like. The middleware only gates /admin/*, so this route relies on its
 * own requireAdmin() check, exactly like every other admin-only server
 * action in this codebase.
 */

export const dynamic = 'force-dynamic';

export default async function PreviewPage({ params }: { params: { prototypeId: string } }) {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin/login');

  const resolved = await resolvePrototypeForPreview(params.prototypeId);
  if (!resolved) notFound();

  const variant = resolved.templateConfig?.styleVariant ?? 'light';
  const derived = resolved.brandKit?.derivedTokens as DerivedTokens | null;
  const style: Record<string, string> = derived
    ? tokensToCssVars(variant === 'dark-industrial' ? derived.dark : derived.light)
    : {};
  const typographyClass =
    (resolved.templateConfig?.typographyId === 'archivo-condensed' ? 'font-condensed' : '') || undefined;

  return (
    <div data-theme={variant} style={style} className={'min-h-dvh bg-concrete text-ink ' + (typographyClass ?? '')}>
      <PreviewRefreshListener />
      <PrototypeView resolved={resolved} />
    </div>
  );
}
