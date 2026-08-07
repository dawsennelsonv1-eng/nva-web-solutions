'use server';

import { requireAdmin } from '@/lib/auth/admin';
import { setSiteTheme, type SiteTheme } from '@/lib/site/theme';

/**
 * app/actions/appearance.ts — flip the site's theme.
 *
 * ============================================================================
 * AUTHORISATION — CLOSED IN PHASE 16F
 * ============================================================================
 *
 * This shipped without an identity check, because the admin session helper had
 * not been pasted into any phase and inventing something that merely looked
 * like authorisation would have been worse than an honest gap.
 *
 * lib/auth/admin.ts is that helper. requireAdmin() reads the cookie-bound
 * session and calls the same is_admin() SQL function middleware uses, so this
 * action and the route gate now agree on one definition of admin rather than
 * two.
 *
 * IT IS CALLED FIRST, BEFORE ANYTHING IS READ OR WRITTEN. A server action's
 * endpoint is the page it was defined on, but that page gate is not a
 * substitute for a check here — as lib/auth/admin.ts puts it, an action whose
 * only protection is "nobody has built a form that calls this from outside
 * /admin yet" is not protected.
 */

export type SetThemeResult = { ok: true; theme: SiteTheme } | { ok: false; message: string };

export async function setThemeAction(next: unknown): Promise<SetThemeResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, message: 'Not signed in as an admin. Sign in again and retry.' };
  }

  const theme: SiteTheme = next === 'dark' ? 'dark' : 'light';
  const wrote = await setSiteTheme(theme);
  if (!wrote) {
    return {
      ok: false,
      message:
        'The theme could not be saved. If migration 0018 has not been run yet, run it first.',
    };
  }
  return { ok: true, theme };
}
