import 'server-only';

/**
 * THE LEGAL SELLER + PRODUCT NAME MODULE (NAMING.md 4-5).
 *
 * Every surface that shows the product name, the legal seller, or the
 * billing-entity disclosure reads it from here. Migrating from the partner's
 * Canadian company to a US LLC is a change to env vars read by this one
 * module — never a search-and-replace across components (SPEC R-014).
 *
 * server-only: LEGAL_SELLER_* are SECRET-tier env vars (ENV.md). They render
 * into server-component HTML (public by nature once rendered) but must never
 * ride into a client bundle as process.env references.
 */

export const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'Girder';

export interface LegalEntity {
  /** Registered legal name — the one the receipt shows, not the trading name. */
  name: string;
  country: string;
  supportEmail: string;
}

export function getLegalEntity(): LegalEntity {
  return {
    // Dev placeholders are OBVIOUSLY fake so a missing env var in production
    // is caught on sight, not shipped silently.
    name: process.env.LEGAL_SELLER_NAME ?? '[SET LEGAL_SELLER_NAME]',
    country: process.env.LEGAL_SELLER_COUNTRY ?? 'Canada',
    supportEmail:
      process.env.LEGAL_SELLER_SUPPORT_EMAIL ?? '[SET LEGAL_SELLER_SUPPORT_EMAIL]',
  };
}

/**
 * The billing-entity disclosure line, verbatim per NAMING.md 5.
 * Appears ABOVE THE FOLD on /pricing and beside the /s/[slug] purchase CTA —
 * always pre-checkout, plain body size, never a tooltip or footer.
 */
export function disclosureLine(): string {
  const e = getLegalEntity();
  return `Payments are processed by ${e.name} (${e.country}) on behalf of NVA Digital Solutions. That's the name that will appear on your receipt.`;
}
