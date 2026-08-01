import { mintAdminToken } from '@/lib/ai/authz';
import { budgetSnapshot } from '@/lib/ai/budget';
import { AI_ROUTES } from '@/lib/ai/config';
import { providerStatus } from '@/lib/ai/providers';
import { ADMIN_JOB_IDS } from '@/lib/ai/types';
import { AiWorkspace, type JobMeta } from '@/components/admin/AiWorkspace';

/**
 * app/admin/ai/page.tsx — renders behind the existing /admin gate.
 *
 * Its one server-side job beyond fetching status is minting the short-lived
 * token the panel sends with every request. Nothing sensitive crosses to the
 * client: the token expires in fifteen minutes and authorizes AI runs only.
 *
 * runtime = 'nodejs' because minting uses node:crypto and the budget read uses
 * the service-role client.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * VERIFY — admin identity.
 *
 * This is the id written to ai_jobs.created_by and used as the rate-limit key.
 * Phase 8 owns admin sessions and its helper is not in scope for this phase,
 * so every run is attributed to a single operator. For a one-person admin that
 * is accurate. When a second person gets access, replace this constant with
 * the session's user id — it is the only line that needs to change.
 */
const ADMIN_IDENTITY = 'admin';

export default async function AiWorkspacePage() {
  const jobs: JobMeta[] = ADMIN_JOB_IDS.map((id) => ({
    id,
    label: AI_ROUTES[id].label,
    description: AI_ROUTES[id].description,
    chain: AI_ROUTES[id].chain.map((c) => c.provider),
  }));

  const budget = await budgetSnapshot();
  const token = mintAdminToken(ADMIN_IDENTITY);

  return (
    <AiWorkspace token={token} jobs={jobs} providers={providerStatus()} budget={budget} />
  );
}
