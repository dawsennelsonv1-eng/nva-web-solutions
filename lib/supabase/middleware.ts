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
 */
export function createSupabaseMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
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
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  return { supabase, getResponse: () => response };
}
