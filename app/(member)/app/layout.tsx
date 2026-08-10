import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireMember, canManageSeats } from '@/lib/auth/member';
import { signOutMemberAction } from '@/app/actions/member';
import { resolveCompanyAccess, hasFullAccess } from '@/lib/entitlements/company';

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
 * NAV IS ROLE-SHAPED AND PLAN-SHAPED. A crew member has no Team link, because
 * he cannot manage seats and showing him a door that refuses him is worse than
 * not showing it. The same argument covers an unpaid account: Leads and Team
 * are not links until there is a subscription behind them.
 *
 * ============================================================================
 * THE NAV IS NOT THE GATE
 * ============================================================================
 *
 * Hiding a link hides nothing. A layout cannot pass props to the page it
 * wraps, so each gated page calls resolveCompanyAccess() for itself and
 * renders the locked panel on its own authority. That means the lookup runs
 * twice on a gated route — two indexed queries on an already force-dynamic
 * render. Cheap, and the alternative is a nav that lies.
 *
 * ============================================================================
 * PHASE 29: THIS IS THE SCREEN THE PRODUCT IS SOLD WITH
 * ============================================================================
 *
 * Restyled onto the marketing design system. The whole pitch is "leads arrive
 * with everything already known about them", and until now the screen where
 * they arrive looked like an internal admin tool — a contractor walked from a
 * considered site into something visibly built by different people.
 *
 * The masthead is the one INVERTED surface, in both themes, the way the hero
 * anchors the homepage. On a long scrolling list of leads the eye always knows
 * where the top is.
 */
export default async function MemberLayout({ children }: { children: ReactNode }) {
  const member = await requireMember();

  if (!member) {
    return (
      <div className="mb-alone">
        <div className="mb-alone-in">
          <h1 className="mb-h">No company yet</h1>
          <p className="mb-lede">
            You are signed in, but this account is not attached to a company. Whoever runs
            your account needs to add you before there is anything here to see.
          </p>
          <form action={signOutMemberAction} className="mb-actions">
            <button type="submit" className="n15-btn n15-btn-ghost">
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  const access = await resolveCompanyAccess(member.companyId);
  const unlocked = hasFullAccess(access);

  return (
    <div className="mb">
      <header className="mb-bar">
        <div className="mb-in">
          <div className="mb-bar-top">
            <span className="mb-co">{member.companyName}</span>
            <form action={signOutMemberAction}>
              <button type="submit" className="mb-out">
                Sign out
              </button>
            </form>
          </div>
          <p className="mb-who">
            {member.email} · {member.role}
            {member.otherCompanyCount > 0 &&
              ` · +${member.otherCompanyCount} other ${
                member.otherCompanyCount === 1 ? 'company' : 'companies'
              }`}
          </p>
          <nav className="mb-nav" aria-label="Account">
            <Link href="/app">Overview</Link>
            {unlocked && <Link href="/app/leads">Leads</Link>}
            {unlocked && canManageSeats(member.role) && <Link href="/app/team">Team</Link>}
          </nav>
        </div>
      </header>
      <main className="mb-main">{children}</main>
    </div>
  );
}
