'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * app/actions/auth.ts — sign out. Sign-in is deliberately NOT a server
 * action: @supabase/ssr's browser client sets the session cookies directly
 * on signInWithPassword, which is the documented pattern and the reason
 * LoginForm.tsx calls it client-side rather than routing through here.
 * Sign-out has no such constraint, and doing it server-side means the
 * cookie clear and the redirect land in one round trip.
 */
export async function signOutAction(): Promise<never> {
  const db = createSupabaseServerClient();
  await db.auth.signOut();
  redirect('/admin/login');
}
