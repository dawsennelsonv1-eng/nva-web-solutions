'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { provisionCompanyAction } from '@/app/actions/signup';

/**
 * components/member/MemberSignupForm.tsx — create an account and a company.
 *
 * ============================================================================
 * TWO STEPS, ONE FORM, AND THE ORDER IS FORCED
 * ============================================================================
 *
 *   1. supabase.auth.signUp() on the BROWSER client. @supabase/ssr sets the
 *      session cookies as part of that call — the same reason MemberLoginForm
 *      calls signInWithPassword client-side rather than through an action.
 *   2. provisionCompanyAction(), which reads the now-cookie-bound session and
 *      creates the company and the principal membership server-side.
 *
 * Step 2 cannot come first: there is no session to read. And step 1 alone
 * leaves a signed-in user with no company, whom middleware bounces to
 * /login?reason=no_company — a real handled state, but a dead end for somebody
 * who just typed their business name in.
 *
 * IF STEP 2 FAILS, THE ACCOUNT STILL EXISTS. The copy says so rather than
 * pretending nothing happened, because the worst version of this screen is one
 * that says "signup failed" to a person who now cannot sign up again with that
 * email — the account is taken and they have no idea why.
 *
 * THE BUSINESS NAME IS OPTIONAL and the field says so rather than being
 * silently permissive. An unlabelled optional field reads as required to
 * anyone who has filled in a form before, so leaving off `required` without
 * saying anything would have changed the validation and not the experience.
 * provisionCompanyAction defaults a blank one to the email prefix.
 *
 * THIS ASSUMES EMAIL CONFIRMATION IS OFF. With it on, signUp() returns no
 * session, step 2 fails with not_signed_in, and every account lands
 * unprovisioned. If confirmation is ever switched back on in Supabase, the
 * provisioning has to move to a callback after the user confirms — not to a
 * retry here.
 */
export function MemberSignupForm() {
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signUpError } = await supabase.auth.signUp({ email, password });

      if (signUpError) {
        // Supabase reports an existing address as a generic failure. Naming the
        // likely cause saves the person guessing at their own password.
        setError(
          signUpError.message.toLowerCase().includes('already')
            ? 'There is already an account for that email. Try signing in instead.'
            : 'Could not create that account. Check the email and try a longer password.'
        );
        setBusy(false);
        return;
      }

      const provisioned = await provisionCompanyAction({ businessName });
      if (!provisioned.ok) {
        setError(provisioned.message);
        setBusy(false);
        return;
      }

      // Hard navigation so middleware sees the just-set cookie.
      window.location.href = '/app';
    } catch {
      setError('Could not create your account. Try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="font-data text-xs uppercase tracking-wide text-rule">
          Business name <span className="normal-case tracking-normal">(optional)</span>
        </span>
        <input
          type="text"
          autoComplete="organization"
          maxLength={120}
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          className="mt-1 min-h-[3rem] w-full rounded-milled border border-rule bg-sheet px-3 text-base"
        />
        <span className="mt-1 block text-xs text-rule">
          Leave it blank and we will use your email name. You can change it later.
        </span>
      </label>
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
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 min-h-[3rem] w-full rounded-milled border border-rule bg-sheet px-3 text-base"
        />
        <span className="mt-1 block text-xs text-rule">At least 8 characters.</span>
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
        {busy ? 'Creating your account…' : 'Create my account'}
      </button>

      <p className="text-sm text-rule">
        Already have one? <Link href="/login" className="underline">Sign in</Link>.
      </p>
    </form>
  );
}

