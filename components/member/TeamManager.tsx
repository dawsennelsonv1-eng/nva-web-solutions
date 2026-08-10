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
      <p className="mb-who mb-who-dark">
        {members.length} of {seatLimit} seat{seatLimit === 1 ? '' : 's'} used
      </p>

      <section className="mb-panel">
        <p className="mb-label">Add someone</p>
        {seatsFull ? (
          <p className="mb-panel-b">
            Every seat on this account is used. Adding another person is a billing change — get in
            touch and it is done the same day.
          </p>
        ) : (
          <div className="mb-lead-controls">
            <label className="mb-field">
              <span className="mb-label">
                Their email
              </span>
              <input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-select"
              />
            </label>
            <label className="mb-field">
              <span className="mb-label">
                What they can see
              </span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mb-select"
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
              className="n15-btn n15-btn-primary"
            >
              {pending ? 'Adding…' : 'Add to this account'}
            </button>
          </div>
        )}
      </section>

      {message && (
        <p className="mb-flag">
          {message.text}
        </p>
      )}

      <ul className="mb-people">
        {members.map((m) => (
          <li key={m.id} className="mb-person mb-person-block">
            <p className="mb-person-who">
              {m.email}
              {m.isSelf && <span className="mb-person-role">YOU</span>}
            </p>
            <p className="mb-who mb-who-dark">
              since {m.createdAt.slice(0, 10)}
            </p>

            <div className="mb-lead-controls">
              <label className="mb-field">
                <span className="mb-label">
                  Role
                </span>
                <select
                  value={m.role}
                  disabled={pending}
                  onChange={(e) => changeRole(m.id, e.target.value)}
                  className="mb-select"
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
                className="n15-btn n15-btn-ghost"
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

