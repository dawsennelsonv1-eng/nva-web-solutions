import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * lib/auth/admin.ts — requireAdmin(): defense in depth for server actions.
 *
 * middleware.ts gates every PAGE under /admin/*, but a Server Action's
 * endpoint is the page it was defined on, not a separately-routable URL —
 * so in the normal browser flow, reaching a mutating admin action already
 * implies the middleware gate passed. This helper exists for the cases that
 * assumption doesn't cover: Phase 5.5 shipped recordManualPaymentAction and
 * recordRefundAction with NO identity check of their own, trusting the page
 * gate alone. That is thinner than this project's own admin surfaces
 * deserve — actions that move money should not have their only protection
 * be "nobody built a form that calls this from outside /admin yet."
 *
 * Every admin-mutating action in this phase (and the Phase 5.5 ones it
 * retrofits) calls this FIRST and bails on null. Read-only admin page loads
 * do not need to — middleware already computed the same is_admin() check
 * for those given the cookie-bound RLS session reads through it anyway.
 */
export interface AdminIdentity {
  email: string;
}

export async function requireAdmin(): Promise<AdminIdentity | null> {
  try {
    const db = createSupabaseServerClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user?.email) return null;

    const { data: isAdmin } = await db.rpc('is_admin');
    if (!isAdmin) return null;

    return { email: user.email };
  } catch {
    return null;
  }
}
