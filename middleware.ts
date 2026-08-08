import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/supabase/middleware';

/**
 * middleware.ts — THE ADMIN GATE (Phase 6) AND THE MEMBER GATE (Phase 14C).
 *
 * Phase 1: dev => always allow; deployed => cookie nva_admin_stub=1.
 * Phase 6: dev AND deployed => a real Supabase Auth session whose email is in
 *          app_admins, checked via the SAME is_admin() SQL function
 *          0003_rls.sql already granted to `authenticated`.
 * Phase 14C: adds a SECOND, SEPARATE gate for /app/* — a contractor's own
 *          people. Two doors, on purpose. See below.
 *
 * ============================================================================
 * WHY TWO SIGN-IN PAGES AND NOT ONE
 * ============================================================================
 *
 * /admin/login is for us. /login is for a contractor's principal, foremen and
 * crew. One shared form would have been less code, and it would have been
 * wrong for three reasons:
 *
 *  1. A foreman should never see a screen marked ADMIN. The moment a customer's
 *     employee lands on our internal door, the product stops feeling like his
 *     company's tool and starts feeling like ours.
 *  2. Blast radius. Credential stuffing against one form hits both populations.
 *     Separate routes mean a rate limit, a lockout, or an outage on one door
 *     does not touch the other.
 *  3. Wrong-door handling has to differ. An admin who is not in app_admins is
 *     signed out — that is a misconfiguration. A member who is not in
 *     company_members is likely a real person whose invite has not landed, and
 *     telling him "not authorized" and destroying his session is the wrong
 *     answer to a support problem.
 *
 * MEMBERSHIP IS NOT CHECKED HERE, and that is deliberate. The admin gate can
 * ask is_admin() cheaply because it is one boolean. Membership is a row per
 * company with a role attached, and middleware runs on every request to every
 * matched path — resolving it here would put a database round trip in front of
 * every navigation and then throw the answer away, because the page needs the
 * role anyway. So middleware proves only that SOMEONE is signed in, and
 * lib/auth/member.ts resolves who they are once, in the layout, where the
 * result is actually used. A signed-in non-member reaches /app and is told
 * plainly that no company is attached to the account.
 *
 * ROUTING, unchanged: /s/[slug]'s 404 semantics still live in its own route.
 *
 * /admin/login and /login are MATCHED but NOT GATED — they have to be
 * reachable to sign in at all — with one exception each: an already-signed-in
 * user visiting either is bounced to where he belongs.
 *
 * Refreshed SESSION COOKIES are always returned, even on the pass-through
 * paths, because @supabase/ssr's token refresh must reach the browser on every
 * request that touches a gated route or the session silently expires mid-visit.
 *
 * ============================================================================
 * PHASE 17A — NOTHING IN HERE MAY THROW
 * ============================================================================
 *
 * This file took production down. lib/supabase/middleware.ts read its env with
 * `?? ''`, which does not catch an env var that is present but EMPTY, and
 * createServerClient threw at construction. An uncaught throw in middleware is
 * not a failed request — it is MIDDLEWARE_INVOCATION_FAILED, a hard 500 on
 * every matched path, with no page-level error boundary anywhere near it.
 *
 * Two changes:
 *
 *  1. The client can now be null (auth not configured). Every path decides
 *     explicitly what that means.
 *  2. The whole body is wrapped. Any unexpected throw — a Supabase outage
 *     surfacing as an exception, a library change — degrades to the same
 *     handling as "not configured" instead of a 500.
 *
 * FAIL CLOSED, NOT OPEN. When identity cannot be established, a gated path
 * redirects to its sign-in page. It never falls through to the page. An
 * unconfigured deployment must not be a way into /admin — that would turn a
 * missing env var from an outage into a breach.
 *
 * The sign-in pages themselves pass through, so /login and /admin/login render
 * and can report their own problem. A visitor sees a form that cannot sign him
 * in, which is the truth, instead of a Vercel 500.
 */

/**
 * What to do when identity cannot be established at all.
 * Gated paths bounce to their door; the doors themselves render.
 */
function unauthenticatedFallback(
  req: NextRequest,
  path: string,
  getResponse: () => NextResponse
): NextResponse {
  if (path === '/login' || path === '/admin/login') return getResponse();
  if (path.startsWith('/app')) return redirectTo(req, '/login');
  return redirectTo(req, '/admin/login');
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const { supabase, getResponse } = createSupabaseMiddlewareClient(req);

  // Auth is not configured on this deployment. Nothing can be proven about who
  // this is, so no gated path may be entered.
  if (!supabase) {
    return unauthenticatedFallback(req, path, getResponse);
  }

  let user: { id: string } | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user ?? null;
  } catch {
    // A thrown auth call is treated exactly like no session. Never a 500.
    return unauthenticatedFallback(req, path, getResponse);
  }
  const isMemberArea = path === '/login' || path.startsWith('/app');

  // ---------------------------------------------------------------- members
  if (isMemberArea) {
    const isMemberLogin = path === '/login';

    if (!user) {
      if (isMemberLogin) return getResponse();
      return redirectTo(req, '/login');
    }

    if (isMemberLogin) {
      const url = req.nextUrl.clone();
      url.pathname = '/app';
      url.search = '';
      return NextResponse.redirect(url);
    }

    // Signed in. Membership and role are resolved in the layout, once.
    return getResponse();
  }

  // ------------------------------------------------------------------ admin
  const isLoginPage = path === '/admin/login';

  if (!user) {
    if (isLoginPage) return getResponse();
    return redirectTo(req, '/admin/login');
  }

  let isAdmin = false;
  try {
    const { data } = await supabase.rpc('is_admin');
    isAdmin = data === true;
  } catch {
    // The RPC failed — a migration not run, a permissions change, an outage.
    // Not admin, and specifically NOT a 500 and NOT a pass-through.
    isAdmin = false;
  }

  if (!isAdmin) {
    // A real Supabase Auth user who is NOT in app_admins.
    //
    // 14C CHANGE: this no longer signs the user out unconditionally. A
    // contractor's foreman who follows a stale /admin link is a legitimate
    // signed-in user, and destroying his member session because he touched
    // the wrong door would log him out of his own company's tool for no
    // reason. He is redirected to /app, which resolves his membership
    // properly. Only a session with no member area to fall back to is torn
    // down — and that decision is made there, not here.
    return redirectTo(req, '/app');
  }

  if (isLoginPage) {
    // Already an authenticated admin — the form has nothing to offer them.
    const url = req.nextUrl.clone();
    url.pathname = '/admin';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return getResponse();
}

function redirectTo(req: NextRequest, pathname: string, reason?: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = reason ? '?reason=' + reason : '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin/:path*', '/app/:path*', '/login'],
};

