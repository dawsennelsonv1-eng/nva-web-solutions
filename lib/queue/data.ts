import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getRegisteredVerticals } from '@/lib/verticals/manifest';
import { TOOLS, VOTE_DISPLAY_FLOOR, type DeclaredStatus, type Tool } from '@/lib/queue/tools';

/**
 * lib/queue/data.ts — the queue's reads, and the mechanism that keeps it honest.
 *
 * THE CENTRAL RULE: a tool's status is not taken on trust from the catalogue.
 * It is reconciled against the vertical registry, which is the only thing in
 * this codebase that knows whether a trade can actually be priced.
 *
 *   registered           -> IN SERVICE, whatever the catalogue claimed
 *   claims IN SERVICE
 *   but not registered   -> demoted to IN BUILD, or SPEC ONLY with no date
 *
 * Both directions matter. The demotion stops the page claiming a trade is live
 * when its module is not loaded — which is exactly the state painting is in
 * today. The promotion means that the moment the painting module is registered
 * in manifest.ts, this page moves it to IN SERVICE by itself, with no copy
 * change and no chance of forgetting.
 *
 * QUEUED IS DERIVED, NEVER DECLARED. A tool is queued when it has at least one
 * real vote. On day one that section is empty and everything unbuilt sits in
 * SPEC ONLY, which is true. Rank therefore always reflects real demand; there
 * is no arrangement of an empty table that could be mistaken for one.
 *
 * NEVER THROWS. A database outage degrades the page to zero votes and no log,
 * never to a 500. The queue still renders, still tells the truth about what is
 * built, and still takes votes when the connection returns.
 */

/** The seeded reference tenant from seed.sql. A fixture, never a customer. */
const SEED_PROTOTYPE_ID = '22222222-2222-4222-8222-222222222222';

// Re-exported so server modules can keep importing it from here.
export { VOTE_DISPLAY_FLOOR };

export type ResolvedStatus = DeclaredStatus | 'QUEUED';

export interface QueueRow {
  tool: Tool;
  status: ResolvedStatus;
  /** Real votes. Zero is real and is displayed as TAKING VOTES, never as "0". */
  votes: number;
  /** 1-based position within QUEUED. Null for every other section. */
  rank: number | null;
  /** Live installs running this vertical. Null when unknown or not in service. */
  deploys: number | null;
}

export interface QueueSections {
  inService: QueueRow[];
  inBuild: QueueRow[];
  queued: QueueRow[];
  specOnly: QueueRow[];
  /** True when the counts below came back from the database. */
  votesLoaded: boolean;
}

async function fetchVoteCounts(): Promise<Map<string, number> | null> {
  try {
    const db = getSupabaseAdminClient();
    const { data, error } = await db.from('tool_vote_counts').select('tool_id, votes');
    if (error || !data) return null;
    const map = new Map<string, number>();
    for (const row of data as { tool_id: string; votes: number }[]) {
      map.set(row.tool_id, Number(row.votes) || 0);
    }
    return map;
  } catch {
    return null;
  }
}

async function fetchDeployCounts(): Promise<Map<string, number> | null> {
  try {
    const db = getSupabaseAdminClient();
    const { data, error } = await db
      .from('prototypes')
      .select('vertical')
      .eq('status', 'live')
      .neq('id', SEED_PROTOTYPE_ID);
    if (error || !data) return null;
    const map = new Map<string, number>();
    for (const row of data as { vertical: string | null }[]) {
      if (!row.vertical) continue;
      map.set(row.vertical, (map.get(row.vertical) ?? 0) + 1);
    }
    return map;
  } catch {
    return null;
  }
}

function registeredIds(): Set<string> {
  try {
    return new Set(getRegisteredVerticals().map((v) => v.id));
  } catch {
    // A registry failure must not take the page down. Treating it as "nothing
    // is registered" fails toward understatement, which is the safe direction.
    return new Set<string>();
  }
}

export async function getQueueSections(): Promise<QueueSections> {
  const [voteMap, deployMap] = await Promise.all([fetchVoteCounts(), fetchDeployCounts()]);
  const live = registeredIds();

  const rows: QueueRow[] = TOOLS.map((tool) => {
    const votes = voteMap?.get(tool.id) ?? 0;

    let status: ResolvedStatus;
    if (live.has(tool.id)) {
      status = 'IN SERVICE';
    } else if (tool.status === 'IN SERVICE') {
      status = tool.targetMonth ? 'IN BUILD' : 'SPEC ONLY';
    } else if (tool.status === 'SPEC ONLY' && votes > 0) {
      status = 'QUEUED';
    } else {
      status = tool.status;
    }

    return {
      tool,
      status,
      votes,
      rank: null,
      deploys: status === 'IN SERVICE' ? (deployMap?.get(tool.id) ?? null) : null,
    };
  });

  const byOrder = (a: QueueRow, b: QueueRow) => a.tool.order - b.tool.order;

  const queued = rows
    .filter((r) => r.status === 'QUEUED')
    .sort((a, b) => b.votes - a.votes || byOrder(a, b))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    inService: rows.filter((r) => r.status === 'IN SERVICE').sort(byOrder),
    inBuild: rows.filter((r) => r.status === 'IN BUILD').sort(byOrder),
    queued,
    specOnly: rows.filter((r) => r.status === 'SPEC ONLY').sort(byOrder),
    votesLoaded: voteMap !== null,
  };
}

/** One tool's row, for the spec sheet. Same reconciliation, same ranking. */
export async function getQueueRow(toolId: string): Promise<QueueRow | null> {
  const sections = await getQueueSections();
  const all = [
    ...sections.inService,
    ...sections.inBuild,
    ...sections.queued,
    ...sections.specOnly,
  ];
  return all.find((r) => r.tool.id === toolId) ?? null;
}

export interface LogEntry {
  occurredOn: string;
  toolId: string | null;
  entry: string;
}

export async function getBuildLog(limit = 12): Promise<LogEntry[]> {
  try {
    const db = getSupabaseAdminClient();
    const { data, error } = await db
      .from('build_log')
      .select('occurred_on, tool_id, entry')
      .order('occurred_on', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as { occurred_on: string; tool_id: string | null; entry: string }[]).map((r) => ({
      occurredOn: r.occurred_on,
      toolId: r.tool_id,
      entry: r.entry,
    }));
  } catch {
    return [];
  }
}

export interface BuildMonth {
  month: string;
  toolId: string;
  wonByVote: boolean;
  enteredBuildOn: string | null;
  shippedOn: string | null;
}

export async function getBuildMonths(): Promise<BuildMonth[]> {
  try {
    const db = getSupabaseAdminClient();
    const { data, error } = await db
      .from('build_months')
      .select('month, tool_id, won_by_vote, entered_build_on, shipped_on')
      .order('month', { ascending: false })
      .limit(12);
    if (error || !data) return [];
    return (
      data as {
        month: string;
        tool_id: string;
        won_by_vote: boolean;
        entered_build_on: string | null;
        shipped_on: string | null;
      }[]
    ).map((r) => ({
      month: r.month,
      toolId: r.tool_id,
      wonByVote: r.won_by_vote,
      enteredBuildOn: r.entered_build_on,
      shippedOn: r.shipped_on,
    }));
  } catch {
    return [];
  }
}
