'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * components/member/MemberLoginForm.tsx — the contractor's door.
 *
 * Mechanically the same as the admin form: signInWithPassword is called on the
 * BROWSER client, because @supabase/ssr sets the session cookies as part of
 * that call. Routing it through a server action would mean signing in twice.
 *
 * NO SELF-SERVE SIGNUP, and here the reason is stronger than on the admin
 * form. A member exists because a principal spent a seat on him. A signup form
 * would let anyone create an account that belongs to no company, which is a
 * support ticket rather than a customer, and it would make seat limits
 * advisory.
 *
 * WRONG-DOOR COPY IS DIFFERENT FROM THE ADMIN FORM'S, deliberately. An admin
 * who fails the check is a misconfiguration. A member who fails it is usually
 * a real person whose invite has not landed — so this says "ask whoever runs
 * your account" rather than "not authorized", and does not destroy his session.
 */
export function MemberLoginForm({ reason }: { reason?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    reason === 'no_company'
      ? 'That account is not attached to a company yet. Ask whoever runs your account to add you.'
      : null
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
      // Hard navigation so middleware sees the just-set cookie.
      window.location.href = '/app';
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
