import { requireMember, canManageSeats } from '@/lib/auth/member';
import { getMemberDb } from '@/lib/companies/db';
import { TeamManager, type TeamMember } from '@/components/member/TeamManager';

export const dynamic = 'force-dynamic';

/**
 * /app/team — the roster, and seat management for a principal.
 *
 * The role gate below is a courtesy so a foreman is not shown controls that
 * would refuse him. It is NOT the security boundary — 0014's
 * members_principal_write is, and app/actions/team.ts re-checks besides. Three
 * layers saying the same thing, in the right order: the policy is correct, the
 * action is readable, the UI is kind.
 */
export default async function TeamPage() {
  const member = await requireMember();
  if (!member) return null;

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
        <h1 className="font-display text-2xl font-extrabold uppercase">Team</h1>
        <p className="mt-1 text-base text-rule">
          Everyone with a sign-in on this account. Only the principal can add or remove people.
        </p>
        <ul className="mt-6 space-y-2">
          {members.map((m) => (
            <li key={m.id} className="border border-rule bg-sheet p-4">
              <p className="text-base">{m.email}</p>
              <p className="mt-1 font-data text-2xs uppercase tracking-[0.08em] text-rule">
                {m.role}
                {m.isSelf ? ' · you' : ''}
              </p>
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
      <h1 className="font-display text-2xl font-extrabold uppercase">Team</h1>
      <p className="mt-1 text-base text-rule">
        Everyone with a sign-in on this account. Leads are assigned to these people.
      </p>
      <TeamManager members={members} seatLimit={company?.seat_limit ?? members.length} />
    </>
  );
}
