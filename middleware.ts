import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/supabase/middleware';

/**
 * middleware.ts — THE REAL ADMIN GATE (Phase 6). Replaces the Phase 1 stub,
 * whose entire body is preserved below in comment form so the change is
 * legible against what it replaces:
 *
 *   Phase 1: dev => always allow; deployed => cookie nva_admin_stub=1.
 *   Phase 6: dev AND deployed => a real Supabase Auth session whose email
 *            is in app_admins, checked via the SAME is_admin() SQL function
 *            0003_rls.sql already granted to `authenticated` — this doesn't
 *            introduce a second admin-identity mechanism, it finally wires
 *            the real check up to infrastructure that has been sitting
 *            ready since Phase 2.
 *
 * ROUTING, unchanged from Phase 1: /s/[slug]'s 404 semantics still live in
 * its own route (a DB round trip in middleware remains the wrong place for
 * tenant resolution). This file continues to gate /admin/* only.
 *
 * /admin/login IS MATCHED but NOT GATED — it has to be reachable to sign in
 * at all — with one exception: an already-authenticated admin visiting it
 * is bounced straight to /admin, so "go to login" never shows a form to
 * someone who doesn't need one.
 *
 * refreshed SESSION COOKIES are always returned, even on the 404-equivalent
 * paths through this function, because @supabase/ssr's token refresh must
 * reach the browser on every request that touches an admin route or the
 * session silently expires mid-visit (see lib/supabase/middleware.ts).
 */

export async function middleware(req: NextRequest) {
  const { supabase, getResponse } = createSupabaseMiddlewareClient(req);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = req.nextUrl.pathname === '/admin/login';

  if (!user) {
    if (isLoginPage) return getResponse();
    return redirectTo(req, '/admin/login');
  }

  const { data: isAdmin } = await supabase.rpc('is_admin');

  if (!isAdmin) {
    // A real Supabase Auth user who is NOT in app_admins. Sign them out
    // rather than leaving a half-authenticated session sitting in the
    // browser, then send them to login with a reason.
    await supabase.auth.signOut();
    return redirectTo(req, '/admin/login', 'not_authorized');
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
  matcher: ['/admin/:path*'],
};
