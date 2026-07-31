'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * components/admin/LoginForm.tsx — email + password, single operator.
 *
 * Calls supabase.auth.signInWithPassword() DIRECTLY from the browser client
 * rather than through a server action. @supabase/ssr's browser client sets
 * the session cookies itself as part of that call — routing it through a
 * server action would mean signing in twice (once server-side to get a
 * session, then needing the browser client to pick it up anyway) for no
 * benefit. This is the documented pattern, not a shortcut.
 *
 * No self-serve signup anywhere in this file or route group, on purpose:
 * "single operator" means the one Supabase Auth user is created once, by
 * hand, in the dashboard (see the delivery notes) — a signup form would be
 * a second, unintended way onto /admin.
 */
export function LoginForm({ reason }: { reason?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    reason === 'not_authorized' ? "That account isn't set up for admin access." : null
  );
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError('Wrong email or password.');
        setBusy(false);
        return;
      }
      // Middleware re-checks on the next navigation; a hard refresh here
      // (rather than router.push) guarantees it sees the just-set cookie.
      window.location.href = '/admin';
    } catch {
      setError('Could not sign in. Try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="font-data text-xs uppercase tracking-wide text-rule">Email</span>
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 min-h-[3rem] w-full rounded-milled border border-rule bg-sheet px-3 text-base"
        />
      </label>
      <label className="block">
        <span className="font-data text-xs uppercase tracking-wide text-rule">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 min-h-[3rem] w-full rounded-milled border border-rule bg-sheet px-3 text-base"
        />
      </label>
      {error ? (
        <p role="alert" className="rounded-milled border border-danger/40 bg-danger/5 p-3 text-sm">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="min-h-[3rem] w-full rounded-milled bg-hazard px-4 font-body text-base font-semibold text-sheet disabled:opacity-60"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
