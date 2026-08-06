'use client';

import { useState, useTransition } from 'react';
import { inviteMemberAction, setMemberRoleAction, removeMemberAction } from '@/app/actions/team';

/**
 * components/member/TeamManager.tsx — seats, for a principal.
 *
 * REMOVAL ASKS TWICE. Not a modal — a second press of the same button, which
 * changes its own label to say what it is about to do. Removing somebody
 * unassigns their leads and ends their access, and this is a screen used on a
 * phone with one thumb where a mis-tap is cheap to make and expensive to
 * undo. The two-press pattern costs nothing and needs no dialog.
 *
 * SEATS ARE SHOWN AS USED-OF-TOTAL EVEN WHEN FULL, rather than hiding the
 * form. A principal who cannot add somebody should see WHY — "3 of 3 used" is
 * an answer, a missing form is a bug report.
 */

export interface TeamMember {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  isSelf: boolean;
}

const ROLES = [
  { value: 'principal', label: 'Principal — billing, seats, every lead' },
  { value: 'foreman', label: 'Foreman — every lead, no seat control' },
  { value: 'crew', label: 'Crew — only leads assigned to him' },
];

export function TeamManager({
  members,
  seatLimit,
}: {
  members: TeamMember[];
  seatLimit: number;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('crew');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const seatsFull = members.length >= seatLimit;

  const invite = () => {
    setMessage(null);
    startTransition(async () => {
      const r = await inviteMemberAction(email, role);
      if (!r.ok) {
        setMessage({ ok: false, text: r.error ?? 'Could not add that person.' });
        return;
      }
      setEmail('');
      setMessage({
        ok: true,
        text: r.note ?? 'Added. They have been emailed a link to set a password.',
      });
    });
  };

  const changeRole = (id: string, next: string) => {
    setMessage(null);
    startTransition(async () => {
      const r = await setMemberRoleAction(id, next);
      if (!r.ok) setMessage({ ok: false, text: r.error ?? 'Could not change that role.' });
    });
  };

  const remove = (id: string) => {
    if (confirming !== id) {
      setConfirming(id);
      return;
    }
    setConfirming(null);
    setMessage(null);
    startTransition(async () => {
      const r = await removeMemberAction(id);
      if (!r.ok) setMessage({ ok: false, text: r.error ?? 'Could not remove that person.' });
    });
  };

  return (
    <>
      <p className="mt-1 font-data text-2xs uppercase tracking-[0.08em] text-rule">
        {members.length} of {seatLimit} seat{seatLimit === 1 ? '' : 's'} used
      </p>

      <section className="mt-6 border border-rule bg-sheet p-4">
        <p className="font-data text-xs uppercase tracking-wide text-rule">Add someone</p>
        {seatsFull ? (
          <p className="mt-2 text-base">
            Every seat on this account is used. Adding another person is a billing change — get in
            touch and it is done the same day.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                Their email
              </span>
              <input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 min-h-[3rem] w-full rounded-milled border border-rule bg-sheet px-3 text-base"
              />
            </label>
            <label className="block">
              <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                What they can see
              </span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 min-h-[3rem] w-full rounded-milled border border-rule bg-sheet px-3 text-base"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={invite}
              disabled={pending || email.trim() === ''}
              className="press min-h-[3rem] w-full rounded-milled bg-hazard px-4 font-body text-base font-semibold text-sheet disabled:opacity-60"
            >
              {pending ? 'Adding…' : 'Add to this account'}
            </button>
          </div>
        )}
      </section>

      {message && (
        <p className={`mt-4 text-base ${message.ok ? 'text-cure' : 'text-danger'}`}>
          {message.text}
        </p>
      )}

      <ul className="mt-6 space-y-2">
        {members.map((m) => (
          <li key={m.id} className="border border-rule bg-sheet p-4">
            <p className="text-base">
              {m.email}
              {m.isSelf && <span className="ml-2 font-data text-2xs text-rule">YOU</span>}
            </p>
            <p className="mt-1 font-data text-2xs uppercase tracking-[0.08em] text-rule">
              since {m.createdAt.slice(0, 10)}
            </p>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                  Role
                </span>
                <select
                  value={m.role}
                  disabled={pending}
                  onChange={(e) => changeRole(m.id, e.target.value)}
                  className="mt-1 block min-h-[3rem] rounded-milled border border-rule bg-sheet px-3 text-base"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.value}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => remove(m.id)}
                disabled={pending}
                className="press min-h-[3rem] rounded-milled border border-ink bg-sheet px-4 font-body text-base font-semibold text-ink disabled:opacity-60"
              >
                {confirming === m.id ? 'Press again to remove' : 'Remove'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
