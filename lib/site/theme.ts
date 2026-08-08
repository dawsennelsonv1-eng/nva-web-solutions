import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * lib/site/theme.ts — which theme the site is wearing.
 *
 * ============================================================================
 * TWO VALUES, CLOSED SET, DEFAULT WINS
 * ============================================================================
 *
 * The database column is text and the check constraint only bounds its length,
 * so anything could in principle be in there. `normalise` maps whatever comes
 * back onto exactly two values and falls through to 'light' for everything
 * else.
 *
 * That is not defensive noise. It means a typo, a half-finished migration, or a
 * row edited by hand in the Supabase console produces a correctly-themed site
 * rather than an unstyled one. The failure mode of a theme system should always
 * be "looks like the default", never "looks broken".
 *
 * ============================================================================
 * CACHING, AND WHY THE ROOT LAYOUT CAN AFFORD TO READ THE DATABASE
 * ============================================================================
 *
 * The root layout renders on every request for every route. A raw query there
 * would put a database round trip in front of every page on the site, including
 * the static ones.
 *
 * unstable_cache holds the value until something explicitly invalidates it, so
 * the steady-state cost is zero queries. `setTheme` calls revalidateTag on the
 * same tag, which is what makes "changes for everyone the moment I switch it"
 * true — the next request after the write reads fresh and everything after it
 * is cached again.
 *
 * The one-hour revalidate is a floor, not the mechanism. It exists so that a
 * value changed directly in the Supabase console — bypassing setTheme and
 * therefore the tag — still reaches the site within an hour instead of never.
 *
 * ============================================================================
 * A FAILED READ IS NOT AN ERROR
 * ============================================================================
 *
 * If the table does not exist yet, or the query fails, this returns 'light'.
 * The site renders in its default theme and nothing tells the visitor anything
 * went wrong, because from his point of view nothing did.
 *
 * This specifically covers the window between deploying this code and running
 * migration 0018. The site does not break in that window; it is simply light.
 */

export type SiteTheme = 'light' | 'dark';

export const DEFAULT_THEME: SiteTheme = 'light';
export const THEME_TAG = 'site-theme';

function normalise(value: string | null | undefined): SiteTheme {
  return value === 'dark' ? 'dark' : 'light';
}

const readTheme = unstable_cache(
  async (): Promise<SiteTheme> => {
    try {
      const db = getSupabaseAdminClient();
      const { data } = await db
        .from('site_settings')
        .select('value')
        .eq('key', 'theme')
        .maybeSingle();
      return normalise(data?.value);
    } catch {
      return DEFAULT_THEME;
    }
  },
  ['site-theme'],
  { tags: [THEME_TAG], revalidate: 3600 }
);

export async function getSiteTheme(): Promise<SiteTheme> {
  return readTheme();
}

/**
 * Writes the theme and invalidates the cache. Callers must already have
 * established that the request is from an admin — this function does not check,
 * because it has no session to check against and a helper that pretends to
 * authorise is worse than one that plainly does not.
 */
export async function setSiteTheme(theme: SiteTheme): Promise<boolean> {
  try {
    const db = getSupabaseAdminClient();
    const { error } = await db
      .from('site_settings')
      .upsert(
        { key: 'theme', value: theme, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    if (error) return false;
    revalidateTag(THEME_TAG);
    return true;
  } catch {
    return false;
  }
}
