import Link from 'next/link';
import { GradientField } from '@/components/site/GradientField';

/**
 * (public) 404 — PHASE 15C restyle.
 *
 * It now offers somewhere to go rather than only home. A 404 on this site is
 * most often a mistyped trade name or an old link to a tool page, so the two
 * destinations are the two places that answer "is my trade on here" — which is
 * the question the visitor almost certainly arrived with.
 *
 * An empty screen is an invitation to act. This one does not apologise and it
 * is not vague about what happened.
 */
export default function PublicNotFound() {
  return (
    <>
      <GradientField />
      <div className="st-state">
        <p className="st-code">404</p>
        <h1>That page isn&apos;t here.</h1>
        <p>
          It may have moved, or the link may be old. The two pages below cover
          most of what people are looking for.
        </p>
        <div className="st-links">
          <Link href="/categories" className="n15-btn n15-btn-primary">
            Find your trade
          </Link>
          <Link href="/" className="n15-btn n15-btn-ghost">
            Back to home
          </Link>
        </div>
      </div>
    </>
  );
}
