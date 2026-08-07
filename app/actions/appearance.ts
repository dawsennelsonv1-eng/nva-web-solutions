'use server';

import { setSiteTheme, type SiteTheme } from '@/lib/site/theme';

/**
 * app/actions/appearance.ts — flip the site's theme.
 *
 * ============================================================================
 * VERIFY — AUTHORISATION
 * ============================================================================
 *
 * This action does NOT check who is calling it. It is reachable from the
 * browser like every server action, so as written, anyone who knows it exists
 * can change the site's appearance.
 *
 * The reason it is shipped this way is that I have not seen the admin session
 * helper. app/admin/ai/page.tsx has its own note saying Phase 8 owns admin
 * sessions and that its identity is a hardcoded constant standing in for one —
 * so there is a gate on the /admin ROUTES, but I cannot see what function
 * asserts it, and inventing a check that looks like authorisation without being
 * it would be worse than an honest gap.
 *
 * THE DAMAGE IS BOUNDED, which is why this is acceptable to ship and not to
 * leave: the worst outcome is the site being the wrong colour until you switch
 * it back. No data is exposed, nothing is destroyed, and setSiteTheme maps its
 * argument onto exactly two values, so this cannot be used to write arbitrary
 * text into the settings table.
 *
 * TO CLOSE IT: import whatever guard app/admin/layout.tsx uses and call it as
 * the first line of the function. One line.
 */

export type SetThemeResult = { ok: true; theme: SiteTheme } | { ok: false; message: string };

export async function setThemeAction(next: unknown): Promise<SetThemeResult> {
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
