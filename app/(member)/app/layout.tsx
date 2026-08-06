import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireMember, canManageSeats } from '@/lib/auth/member';
import { signOutMemberAction } from '@/app/actions/member';

/**
 * (member) layout — the shell every /app route renders inside.
 *
 * THIS IS WHERE MEMBERSHIP IS RESOLVED, once. Middleware proved somebody is
 * signed in; it deliberately did not ask which company, because that is a
 * database round trip whose answer the page needs anyway. Doing it here means
 * one query instead of two, and the role is available to decide what the nav
 * even contains.
 *
 * A SIGNED-IN NON-MEMBER IS NOT AN INTRUDER. He is almost always a real person
 * whose invite has not been accepted or whose seat was removed, so he gets a
 * sentence and a sign-out button rather than a redirect loop or a destroyed
 * session. Silently bouncing him to /login — where he would sign in
 * successfully and bounce again — is the failure this branch exists to avoid.
 *
 * NAV IS ROLE-SHAPED. A crew member has no Team link, because he cannot manage
 * seats and showing him a door that refuses him is worse than not showing it.
 */
export default async function MemberLayout({ children }: { children: ReactNode }) {
  const member = await requireMember();

  if (!member) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
        <div className="w-full">
          <h1 className="font-display text-2xl font-extrabold uppercase">No company yet</h1>
          <p className="mt-3 text-base">
            You are signed in, but this account is not attached to a company. Whoever runs your
            account needs to add you before there is anything here to see.
          </p>
          <form action={signOutMemberAction} className="mt-6">
            <button
              type="submit"
              className="min-h-[3rem] w-full rounded-milled border border-ink bg-sheet px-4 font-body text-base font-semibold text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-concrete">
      <header className="bg-ink text-sheet">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-display text-lg font-extrabold uppercase">
              {member.companyName}
            </span>
            <form action={signOutMemberAction}>
              <button
                type="submit"
                className="press font-data text-2xs uppercase tracking-[0.08em] text-rule"
              >
                Sign out
              </button>
            </form>
          </div>
          <p className="mt-0.5 font-data text-2xs uppercase tracking-[0.08em] text-rule">
            {member.email} · {member.role}
            {member.otherCompanyCount > 0 &&
              ` · +${member.otherCompanyCount} other ${
                member.otherCompanyCount === 1 ? 'company' : 'companies'
              }`}
          </p>
          <nav className="mt-3 flex gap-4 font-data text-sm" aria-label="Account">
            <Link href="/app" className="whitespace-nowrap text-sheet">
              Overview
            </Link>
            <Link href="/app/leads" className="whitespace-nowrap text-sheet">
              Leads
            </Link>
            {canManageSeats(member.role) && (
              <Link href="/app/team" className="whitespace-nowrap text-sheet">
                Team
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
