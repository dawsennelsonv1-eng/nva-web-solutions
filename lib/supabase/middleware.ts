import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';

/**
 * lib/supabase/middleware.ts — the Supabase client for the MIDDLEWARE
 * context specifically.
 *
 * WHY THIS IS ITS OWN FILE, separate from lib/supabase/server.ts: middleware
 * has a fundamentally different cookie API than a Server Component or Route
 * Handler. next/headers' cookies() (used by server.ts) is read-only outside
 * a Route Handler/Server Action and writes are a no-op there by design.
 * Middleware instead reads from the incoming NextRequest and must write any
 * refreshed session cookie onto the OUTGOING NextResponse — get that
 * wrong and Supabase Auth's token refresh silently never persists, which
 * shows up as a real user getting logged out at a seemingly random moment
 * (whenever the access token happens to expire mid-session).
 *
 * The pattern below — build a fresh response early, mirror every cookie
 * write onto both the request and that response, return the response — is
 * @supabase/ssr's own documented shape for Next.js middleware. Deviating
 * from it (e.g. reusing NextResponse.next() created before the client) is
 * the most common way this integration breaks.
 *
 * ============================================================================
 * IT RETURNS null WHEN AUTH IS NOT CONFIGURED — PHASE 17A
 * ============================================================================
 *
 * This crashed production. The env vars were read as
 * `process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''`, and `??` only substitutes for
 * `undefined` — an env var that is PRESENT BUT EMPTY passes straight through.
 * createServerClient then throws `supabaseKey is required` at construction,
 * synchronously, before any request handling. Nothing caught it, so every
 * matched path returned MIDDLEWARE_INVOCATION_FAILED: a hard 500 on /login,
 * /app/* and all of /admin.
 *
 * A missing env var must never be able to take a route down. The presence
 * check below is explicit — `.length > 0` after a trim, not `??` — and the
 * construction is wrapped, because a future version of the library could throw
 * for a reason this check does not anticipate.
 *
 * The caller decides what an unconfigured deployment means for each path. See
 * middleware.ts: it fails CLOSED for gated routes and open only for the sign-in
 * pages themselves.
 */
export function createSupabaseMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

  // Not configured. Return the response builder without a client so the caller
  // can still send refreshed-cookie-free traffic through, and let it decide
  // what to do about the missing auth.
  if (url.length === 0 || anonKey.length === 0) {
    return { supabase: null, getResponse: () => response };
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Mirror onto the request (so THIS request's later reads see the
        // refreshed value) and rebuild the response from that request
        // (so the value actually reaches the browser).
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: request.headers } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  return { supabase, getResponse: () => response };
}

