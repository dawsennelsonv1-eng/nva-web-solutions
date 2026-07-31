import { NextResponse, type NextRequest } from 'next/server';

/**
 * ROUTING CONTRACT (Phase 1):
 *  - /admin/*            → requires an admin session (STUB below; Phase 6
 *                          replaces with the real Supabase Auth check)
 *  - /s/[slug]           → public; ACTIVE-prototype-or-404 is enforced in the
 *                          ROUTE via resolvePrototypeBySlug (stubbed now).
 *                          Deliberate: a per-request DB lookup does not belong
 *                          in edge middleware. The 404 semantics are identical.
 *  - / /demo /q/* /pricing /checkout/* → fully public, untouched.
 *
 * ---- ADMIN AUTH STUB — Phase 6 replaces the body of isAdminAuthenticated ----
 * Dev: always allowed. Deployed: requires the presence of an opt-in cookie
 * (`nva_admin_stub=1`) so preview deploys don't expose admin placeholders to
 * a wandering crawler, while you can still test from your phone:
 * in the browser console run  document.cookie = 'nva_admin_stub=1; path=/'
 * This is a placeholder GATE, not security. Real auth: Phase 6.
 */
function isAdminAuthenticated(req: NextRequest): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  return req.cookies.get('nva_admin_stub')?.value === '1';
}

export function middleware(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
