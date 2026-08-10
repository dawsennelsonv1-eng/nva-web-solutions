import { requireMember, canManageSeats } from '@/lib/auth/member';
import { getMemberDb } from '@/lib/companies/db';
import { TeamManager, type TeamMember } from '@/components/member/TeamManager';
import { LockedPanel } from '@/components/member/LockedPanel';
import { resolveCompanyAccess, hasFullAccess } from '@/lib/entitlements/company';

export const dynamic = 'force-dynamic';

/**
 * /app/team — the roster, and seat management for a principal.
 *
 * The role gate below is a courtesy so a foreman is not shown controls that
 * would refuse him. It is NOT the security boundary — 0014's
 * members_principal_write is, and app/actions/team.ts re-checks besides. Three
 * layers saying the same thing, in the right order: the policy is correct, the
 * action is readable, the UI is kind.
 *
 * THE PLAN GATE COMES FIRST, BEFORE THE ROLE GATE, because it answers a
 * different question and a coarser one: not "may this person manage seats" but
 * "does this account have seats to manage". Asking the role question first
 * would show a crew member of an unpaid company the roster of a product his
 * company has not bought.
 */
export default async function TeamPage() {
  const member = await requireMember();
  if (!member) return null;

  const access = await resolveCompanyAccess(member.companyId);
  if (!hasFullAccess(access)) {
    return (
      <LockedPanel
        title="Team"
        blurb="Give your foremen and crew their own sign-in, then assign each lead to whoever is chasing it. Seats are included with the plan."
      />
    );
  }

  const db = getMemberDb();

  const { data: rows } = await db
    .from('company_members')
    .select('id, email, role, created_at')
    .order('created_at', { ascending: true });
  const raw = (rows ?? []) as {
    id: string;
    email: string;
    role: string;
    created_at: string;
  }[];

  const members: TeamMember[] = raw.map((m) => ({
    id: m.id,
    email: m.email,
    role: m.role,
    createdAt: m.created_at,
    isSelf: m.id === member.memberId,
  }));

  if (!canManageSeats(member.role)) {
    return (
      <>
        <p className="n15-eyebrow">Your people</p>
        <h1 className="mb-h">Team</h1>
        <p className="mb-lede">
          Everyone with a sign-in on this account. Only the principal can add or remove
          people.
        </p>
        <ul className="mb-people">
          {members.map((m) => (
            <li key={m.id} className="mb-person">
              <p className="mb-person-who">{m.email}</p>
              <span className="mb-person-role">
                {m.role}
                {m.isSelf ? ' · you' : ''}
              </span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const { data: company } = await db
    .from('companies')
    .select('seat_limit')
    .eq('id', member.companyId)
    .maybeSingle<{ seat_limit: number }>();

  return (
    <>
      <p className="n15-eyebrow">Your people</p>
      <h1 className="mb-h">Team</h1>
      <p className="mb-lede">
        Everyone with a sign-in on this account. Leads are assigned to these people.
      </p>
      <TeamManager members={members} seatLimit={company?.seat_limit ?? members.length} />
    </>
  );
}

