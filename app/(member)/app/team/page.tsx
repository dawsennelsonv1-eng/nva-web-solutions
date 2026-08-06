import { requireMember, canManageSeats } from '@/lib/auth/member';
import { getMemberDb } from '@/lib/companies/db';

export const dynamic = 'force-dynamic';

/**
 * /app/team — the roster.
 *
 * READ ONLY IN THIS PASS, and that is stated on the page rather than implied
 * by the absence of buttons. Adding a member means creating a Supabase Auth
 * user, emailing an invite, and enforcing seat_limit — three things that
 * deserve their own delivery rather than being bolted on here.
 *
 * The role gate is a courtesy, not the security boundary: 0014's
 * members_principal_write is what actually stops a crew member adding seats.
 */
export default async function TeamPage() {
  const member = await requireMember();
  if (!member) return null;

  if (!canManageSeats(member.role)) {
    return (
      <>
        <h1 className="font-display text-2xl font-extrabold uppercase">Team</h1>
        <p className="mt-3 text-base">Only the principal on this account can manage the team.</p>
      </>
    );
  }

  const db = getMemberDb();
  const { data } = await db
    .from('company_members')
    .select('id, email, role, created_at')
    .order('created_at', { ascending: true });
  const members = (data ?? []) as { id: string; email: string; role: string; created_at: string }[];

  return (
    <>
      <h1 className="font-display text-2xl font-extrabold uppercase">Team</h1>
      <p className="mt-1 text-base text-rule">
        Everyone with a sign-in on this account. Leads are assigned to these people.
      </p>

      <ul className="mt-6 space-y-2">
        {members.map((m) => (
          <li key={m.id} className="border border-rule bg-sheet p-4">
            <p className="text-base">{m.email}</p>
            <p className="mt-1 font-data text-2xs uppercase tracking-[0.08em] text-rule">
              {m.role} · since {m.created_at.slice(0, 10)}
              {m.id === member.memberId ? ' · you' : ''}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-6 border-t border-rule pt-4 text-sm text-rule">
        Adding and removing people is not built yet. It needs an invite email and seat enforcement,
        which are their own piece of work rather than a button added here.
      </p>
    </>
  );
}
