'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AdminJobId, AiStreamEvent, JobCostBreakdown } from '@/lib/ai/types';

/**
 * components/admin/AiWorkspace.tsx — pick a job, say what you want, watch it
 * write, then decide.
 *
 * THE ONE RULE THIS COMPONENT OBEYS: nothing here is a guard. The token in
 * props is checked server-side, the spend ceiling is checked server-side, the
 * rate limit is checked server-side, and the payload is validated server-side
 * twice — once on the way out of the model and again before Apply. What this
 * file does is show a person what it will cost and let them say no.
 *
 * Styling uses core Tailwind utilities only. This panel lives inside whatever
 * shell /admin already provides and deliberately introduces no design language
 * of its own.
 */

export interface JobMeta {
  id: AdminJobId;
  label: string;
  description: string;
  chain: string[];
}

export interface ProviderMeta {
  id: string;
  label: string;
  configured: boolean;
  requires: string;
}

export interface AiWorkspaceProps {
  /** Null when AI_ADMIN_TOKEN_SECRET is unset. The panel then refuses to run. */
  token: string | null;
  jobs: JobMeta[];
  providers: ProviderMeta[];
  budget: {
    spentCents: number | null;
    ceilingCents: number;
    remainingCents: number | null;
    resetsAt: string;
  };
}

type RunState = 'idle' | 'running' | 'done' | 'failed';
type DecisionState = 'undecided' | 'deciding' | 'applied' | 'discarded';

interface RunError {
  message: string;
  action: string;
  issues?: string[] | undefined;
}

const TOKEN_MENU = {
  density: ['compact', 'regular', 'roomy'],
  corner_radius: ['none', 'sm', 'md', 'lg', 'pill'],
  elevation: ['flat', 'hairline', 'raised'],
  accent_role: ['brand', 'neutral', 'contrast'],
  emphasis: ['quiet', 'balanced', 'loud'],
  heading_scale: ['sm', 'md', 'lg', 'xl'],
  motion: ['none', 'subtle', 'expressive'],
  alignment: ['left', 'center'],
} as const;

type TokenName = keyof typeof TOKEN_MENU;

const DEFAULT_TOKENS: Record<TokenName, string> = {
  density: 'regular',
  corner_radius: 'md',
  elevation: 'hairline',
  accent_role: 'brand',
  emphasis: 'balanced',
  heading_scale: 'lg',
  motion: 'subtle',
  alignment: 'left',
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const field =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1';
const label = 'block text-xs font-medium uppercase tracking-wide text-slate-500';
const button =
  'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-opacity duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50';

export function AiWorkspace({ token, jobs, providers, budget }: AiWorkspaceProps) {
  const [job, setJob] = useState<AdminJobId>(jobs[0]?.id ?? 'site_copy');
  const [intent, setIntent] = useState('');
  const [vertical, setVertical] = useState('concrete and epoxy floor coating');
  const [market, setMarket] = useState('Dallas, Texas');
  const [businessName, setBusinessName] = useState('');
  const [tone, setTone] = useState('plain');
  const [differentiators, setDifferentiators] = useState('');
  const [componentId, setComponentId] = useState('');
  const [surface, setSurface] = useState('prototype');
  const [tokens, setTokens] = useState<Record<TokenName, string>>(DEFAULT_TOKENS);
  const [paramsText, setParamsText] = useState('base_rate_per_sqft = 7\nminimum_job_price = 1200');
  const [evidence, setEvidence] = useState('');

  const [state, setState] = useState<RunState>('idle');
  const [raw, setRaw] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [data, setData] = useState<unknown>(null);
  const [cost, setCost] = useState<JobCostBreakdown | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<RunError | null>(null);
  const [decision, setDecision] = useState<DecisionState>('undecided');
  const [decisionNote, setDecisionNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeJob = useMemo(() => jobs.find((j) => j.id === job) ?? jobs[0], [jobs, job]);
  const missingProviders = providers.filter((p) => !p.configured);

  const buildInput = useCallback((): Record<string, unknown> => {
    if (job === 'site_copy') {
      return {
        intent,
        vertical,
        market,
        business_name: businessName || undefined,
        tone,
        differentiators: differentiators || undefined,
      };
    }
    if (job === 'component_restyle') {
      return { intent, component_id: componentId, surface, current_tokens: tokens };
    }
    return {
      intent,
      vertical,
      market,
      current_params: parseParams(paramsText),
      evidence: evidence || undefined,
    };
  }, [
    job,
    intent,
    vertical,
    market,
    businessName,
    tone,
    differentiators,
    componentId,
    surface,
    tokens,
    paramsText,
    evidence,
  ]);

  const run = useCallback(async () => {
    if (!token) return;
    setState('running');
    setRaw('');
    setNotes([]);
    setData(null);
    setCost(null);
    setJobId(null);
    setError(null);
    setDecision('undecided');
    setDecisionNote(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/ai/${job}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-nva-ai-token': token },
        body: JSON.stringify({ input: buildInput() }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: string; action?: string; issues?: string[] }
          | null;
        setError({
          message: payload?.error ?? 'The run could not start.',
          action: payload?.action ?? 'Try again in a moment.',
          issues: payload?.issues,
        });
        setState('failed');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          handleEvent(block);
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setState('idle');
        return;
      }
      setError({
        message: 'The connection to the server dropped mid-run.',
        action: 'Check the run log in the ledger before running it again — it may have completed.',
      });
      setState('failed');
    } finally {
      abortRef.current = null;
    }

    function handleEvent(block: string) {
      const line = block.split('\n').find((l) => l.startsWith('data: '));
      if (!line) return;
      let event: AiStreamEvent;
      try {
        event = JSON.parse(line.slice(6)) as AiStreamEvent;
      } catch {
        return;
      }

      if (event.type === 'delta') {
        setRaw((prev) => prev + event.text);
      } else if (event.type === 'start') {
        setNotes((prev) => [...prev, `Started on ${event.provider} · ${event.model}`]);
      } else if (event.type === 'repair') {
        setNotes((prev) => [...prev, `Asked for a correction: ${event.detail}`]);
      } else if (event.type === 'fallback') {
        setNotes((prev) => [
          ...prev,
          `${event.from} failed (${event.reason}). Trying ${event.to}.`,
        ]);
      } else if (event.type === 'done') {
        setData(event.data);
        setCost(event.cost);
        setJobId(event.jobId);
        setState('done');
      } else if (event.type === 'error') {
        setError({ message: event.message, action: event.action });
        setState('failed');
      }
    }
  }, [token, job, buildInput]);

  const decide = useCallback(
    async (choice: 'apply' | 'discard') => {
      if (!token || !jobId) return;
      setDecision('deciding');
      try {
        const res = await fetch(`/api/ai/${job}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', 'x-nva-ai-token': token },
          body: JSON.stringify({ job_id: jobId, decision: choice }),
        });
        const payload = (await res.json().catch(() => null)) as
          | { error?: string; action?: string; message?: string }
          | null;
        if (!res.ok) {
          setError({
            message: payload?.error ?? 'That decision did not go through.',
            action: payload?.action ?? 'Reload the workspace and check the ledger.',
          });
          setDecision('undecided');
          return;
        }
        setDecision(choice === 'apply' ? 'applied' : 'discarded');
        setDecisionNote(payload?.message ?? null);
      } catch {
        setError({
          message: 'That decision did not reach the server.',
          action: 'Check your connection and try again.',
        });
        setDecision('undecided');
      }
    },
    [token, jobId, job]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 text-slate-900">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">AI workspace</h1>
        <p className="text-sm text-slate-600">
          Every run costs money and every result is a proposal until you apply it.
        </p>
        <BudgetStrip budget={budget} />
      </header>

      {!token ? (
        <Callout tone="warn" title="AI runs are switched off on this deployment">
          AI_ADMIN_TOKEN_SECRET is not set, so the server will refuse every run. Set it in
          Vercel (any long random string) and redeploy.
        </Callout>
      ) : null}

      {missingProviders.length > 0 ? (
        <Callout tone="info" title="Some providers have no key">
          {missingProviders.map((p) => `${p.label} needs ${p.requires}`).join('. ')}. Jobs will
          skip them and use whichever provider in the chain does have one.
        </Callout>
      ) : null}

      <section className="space-y-3">
        <span className={label}>Job</span>
        <div className="flex flex-wrap gap-2">
          {jobs.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => setJob(j.id)}
              aria-pressed={j.id === job}
              className={`${button} ${
                j.id === job
                  ? 'bg-slate-900 text-white focus-visible:ring-slate-900'
                  : 'border border-slate-300 bg-white text-slate-700 focus-visible:ring-slate-400'
              }`}
            >
              {j.label}
            </button>
          ))}
        </div>
        {activeJob ? (
          <p className="text-sm text-slate-600">
            {activeJob.description} Tries {activeJob.chain.join(', then ')}.
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        {job === 'site_copy' ? (
          <>
            <Row>
              <Field id="vertical" title="Trade">
                <input id="vertical" className={field} value={vertical} onChange={(e) => setVertical(e.target.value)} />
              </Field>
              <Field id="market" title="Market">
                <input id="market" className={field} value={market} onChange={(e) => setMarket(e.target.value)} />
              </Field>
            </Row>
            <Row>
              <Field id="business" title="Business name (optional)">
                <input id="business" className={field} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
              </Field>
              <Field id="tone" title="Tone">
                <select id="tone" className={field} value={tone} onChange={(e) => setTone(e.target.value)}>
                  {['plain', 'warm', 'premium', 'no-nonsense'].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </Row>
            <Field id="diff" title="True differentiators, one per line">
              <textarea
                id="diff"
                rows={3}
                className={field}
                placeholder="Same-day estimates&#10;Ten-year coating warranty"
                value={differentiators}
                onChange={(e) => setDifferentiators(e.target.value)}
              />
              <Hint>Only what is true. Anything left out will not be claimed.</Hint>
            </Field>
          </>
        ) : null}

        {job === 'component_restyle' ? (
          <>
            <Row>
              <Field id="component" title="Component id">
                <input
                  id="component"
                  className={field}
                  placeholder="quote-summary-card"
                  value={componentId}
                  onChange={(e) => setComponentId(e.target.value)}
                />
              </Field>
              <Field id="surface" title="Surface">
                <select id="surface" className={field} value={surface} onChange={(e) => setSurface(e.target.value)}>
                  {['hub', 'demo', 'prototype', 'admin'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            </Row>
            <div className="space-y-2">
              <span className={label}>Current tokens</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(Object.keys(TOKEN_MENU) as TokenName[]).map((name) => (
                  <Field key={name} id={`token-${name}`} title={name.replace(/_/g, ' ')}>
                    <select
                      id={`token-${name}`}
                      className={field}
                      value={tokens[name]}
                      onChange={(e) => setTokens((prev) => ({ ...prev, [name]: e.target.value }))}
                    >
                      {TOKEN_MENU[name].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {job === 'quote_params' ? (
          <>
            <Row>
              <Field id="qvertical" title="Trade">
                <input id="qvertical" className={field} value={vertical} onChange={(e) => setVertical(e.target.value)} />
              </Field>
              <Field id="qmarket" title="Market">
                <input id="qmarket" className={field} value={market} onChange={(e) => setMarket(e.target.value)} />
              </Field>
            </Row>
            <Field id="params" title="Current parameters, one per line">
              <textarea
                id="params"
                rows={4}
                className={`${field} font-mono`}
                value={paramsText}
                onChange={(e) => setParamsText(e.target.value)}
              />
              <Hint>Format: name = number. Only these parameters can be proposed.</Hint>
            </Field>
            <Field id="evidence" title="What you have observed (optional)">
              <textarea
                id="evidence"
                rows={3}
                className={field}
                placeholder="Lost 3 of the last 5 quotes over 900 sqft."
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              />
            </Field>
          </>
        ) : null}

        <Field id="intent" title="What you want">
          <textarea
            id="intent"
            rows={4}
            className={field}
            placeholder="Rewrite the hero for homeowners comparing three bids."
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={!token || state === 'running' || intent.trim().length < 10}
            className={`${button} bg-slate-900 text-white focus-visible:ring-slate-900`}
          >
            {state === 'running' ? 'Running…' : 'Run'}
          </button>
          {state === 'running' ? (
            <button
              type="button"
              onClick={cancel}
              className={`${button} border border-slate-300 bg-white text-slate-700 focus-visible:ring-slate-400`}
            >
              Stop
            </button>
          ) : null}
          {intent.trim().length < 10 ? (
            <span className="text-xs text-slate-500">Describe what you want first.</span>
          ) : null}
        </div>
      </section>

      <section aria-live="polite" className="space-y-4">
        {notes.length > 0 ? (
          <ul className="space-y-1 text-xs text-slate-500">
            {notes.map((n, i) => (
              <li key={`${n}-${i}`}>{n}</li>
            ))}
          </ul>
        ) : null}

        {state === 'running' || raw.length > 0 ? (
          <div className="space-y-2">
            <span className={label}>Model output</span>
            <pre className="max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
              {raw || 'Waiting for the first tokens…'}
            </pre>
          </div>
        ) : null}

        {error ? (
          <Callout tone="error" title={error.message}>
            {error.action}
            {error.issues && error.issues.length > 0 ? (
              <ul className="mt-2 list-disc pl-5">
                {error.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </Callout>
        ) : null}

        {state === 'idle' && !raw && !error ? (
          <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Nothing has run yet. Pick a job, describe what you want, and press Run.
          </p>
        ) : null}

        {state === 'done' && data !== null ? (
          <div className="space-y-4">
            {cost ? <CostLine cost={cost} /> : null}
            <div className="space-y-2">
              <span className={label}>Proposed change</span>
              <Preview job={job} data={data} />
            </div>

            {decision === 'undecided' || decision === 'deciding' ? (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => decide('apply')}
                  disabled={decision === 'deciding' || !jobId}
                  className={`${button} bg-emerald-700 text-white focus-visible:ring-emerald-700`}
                >
                  {decision === 'deciding' ? 'Working…' : 'Apply'}
                </button>
                <button
                  type="button"
                  onClick={() => decide('discard')}
                  disabled={decision === 'deciding' || !jobId}
                  className={`${button} border border-slate-300 bg-white text-slate-700 focus-visible:ring-slate-400`}
                >
                  Discard
                </button>
                {!jobId ? (
                  <span className="text-xs text-slate-500">
                    This run was not recorded, so it cannot be applied. Run it again.
                  </span>
                ) : null}
              </div>
            ) : (
              <Callout tone={decision === 'applied' ? 'info' : 'muted'} title={
                decision === 'applied' ? 'Applied' : 'Discarded'
              }>
                {decisionNote ?? 'Recorded in the ledger.'}
              </Callout>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// pieces
// ---------------------------------------------------------------------------

function BudgetStrip({ budget }: { budget: AiWorkspaceProps['budget'] }) {
  if (budget.spentCents === null) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Today&rsquo;s spending could not be read, so runs will be refused until it can.
      </p>
    );
  }
  const pct = budget.ceilingCents > 0 ? Math.min(100, (budget.spentCents / budget.ceilingCents) * 100) : 100;
  return (
    <div className="space-y-1">
      <p className="text-sm text-slate-600">
        {money(budget.spentCents)} of {money(budget.ceilingCents)} spent today. Resets at 00:00
        UTC.
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-slate-900 transition-transform duration-300 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CostLine({ cost }: { cost: JobCostBreakdown }) {
  return (
    <p className="text-sm text-slate-600">
      {cost.estimated ? 'About ' : ''}
      <span className="font-medium text-slate-900">{money(cost.costCents)}</span> · {cost.provider}{' '}
      · {cost.model} · {cost.usage.inputTokens.toLocaleString()} in,{' '}
      {cost.usage.outputTokens.toLocaleString()} out
      {cost.usage.cachedInputTokens > 0
        ? ` · ${cost.usage.cachedInputTokens.toLocaleString()} cached`
        : ''}
      {cost.estimated ? ' · this provider did not report usage, so tokens are estimated' : ''}
    </p>
  );
}

function Preview({ job, data }: { job: AdminJobId; data: unknown }) {
  const record = data as Record<string, unknown>;

  if (job === 'site_copy') {
    return (
      <div className="space-y-3 rounded-md border border-slate-200 p-4">
        <p className="text-lg font-semibold">{String(record.headline ?? '')}</p>
        <p className="text-sm text-slate-600">{String(record.subheadline ?? '')}</p>
        <p className="text-xs text-slate-500">
          Buttons: {String(record.primary_cta ?? '')} / {String(record.secondary_cta ?? '')}
        </p>
        <TitledList title="Value props" items={record.value_props} />
        <TitledList title="Process" items={record.process_steps} />
        <p className="text-xs text-slate-500">{String(record.trust_line ?? '')}</p>
      </div>
    );
  }

  if (job === 'component_restyle') {
    const changes = Array.isArray(record.changes) ? record.changes : [];
    return (
      <div className="space-y-3 rounded-md border border-slate-200 p-4">
        <p className="text-sm text-slate-700">{String(record.intent_summary ?? '')}</p>
        <ul className="space-y-1 text-sm">
          {changes.map((c, i) => {
            const change = c as Record<string, unknown>;
            return (
              <li key={i} className="flex flex-wrap gap-1">
                <span className="font-medium">{String(change.token ?? '')}</span>
                <span className="text-slate-500">
                  {String(change.from ?? '')} → {String(change.to ?? '')}
                </span>
                <span className="w-full text-xs text-slate-500">{String(change.why ?? '')}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const adjustments = Array.isArray(record.adjustments) ? record.adjustments : [];
  return (
    <div className="space-y-3 rounded-md border border-slate-200 p-4">
      <p className="text-sm text-slate-700">{String(record.summary ?? '')}</p>
      <p className="text-xs uppercase tracking-wide text-slate-500">
        Risk if wrong: {String(record.risk_level ?? '')}
      </p>
      <ul className="space-y-2 text-sm">
        {adjustments.map((a, i) => {
          const adj = a as Record<string, unknown>;
          return (
            <li key={i}>
              <span className="font-medium">{String(adj.param ?? '')}</span>{' '}
              <span className="text-slate-500">
                {String(adj.current_value ?? '')} → {String(adj.proposed_value ?? '')}{' '}
                {String(adj.unit ?? '')}
              </span>
              <span className="block text-xs text-slate-500">{String(adj.rationale ?? '')}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TitledList({ title, items }: { title: string; items: unknown }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</span>
      <ul className="space-y-1 text-sm">
        {items.map((item, i) => {
          const entry = item as Record<string, unknown>;
          return (
            <li key={i}>
              <span className="font-medium">{String(entry.title ?? '')}</span>
              <span className="block text-xs text-slate-500">{String(entry.body ?? '')}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={label}>
        {title}
      </label>
      {children}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-slate-500">{children}</p>;
}

type CalloutTone = 'info' | 'warn' | 'error' | 'muted';

function Callout({
  tone,
  title,
  children,
}: {
  tone: CalloutTone;
  title: string;
  children: ReactNode;
}) {
  const tones: Record<CalloutTone, string> = {
    info: 'border-slate-300 bg-slate-50 text-slate-800',
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    error: 'border-red-300 bg-red-50 text-red-900',
    muted: 'border-slate-200 bg-white text-slate-600',
  };
  return (
    <div className={`rounded-md border p-3 text-sm ${tones[tone]}`}>
      <p className="font-medium">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** "base_rate_per_sqft = 7" per line. Anything unparseable is dropped here and
 *  rejected by the server schema, which is the one that matters. */
function parseParams(text: string): Array<{ param: string; value: number }> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [name, value] = line.split('=');
      return { param: (name ?? '').trim(), value: Number.parseFloat((value ?? '').trim()) };
    })
    .filter((entry) => entry.param.length > 0 && Number.isFinite(entry.value));
}
