import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { FinishMediaKind, FinishMediaSlot } from '@/lib/finishes/media-types';

/**
 * lib/finishes/media.ts — reading and writing the picker's pictures.
 *
 * ============================================================================
 * EVERY READ DEGRADES TO EMPTY, NEVER TO AN ERROR
 * ============================================================================
 *
 * The picker is on the public funnel. A missing table, an unrun migration or a
 * database hiccup must cost a visitor some pictures — never the ability to
 * choose a floor and get a quote. So every function here returns [] or false on
 * failure and the caller renders its empty state.
 *
 * That empty state is not a degraded mode here, it is the NORMAL one. The
 * catalogue permits hundreds of combinations and nobody will photograph them
 * all, so "no picture for this exact mix" has to be a first-class, unalarming
 * screen rather than something that looks broken.
 *
 * `types/database.ts` stops at migration 0005 and this table arrives in 0022,
 * so the narrow structural cast below is the established pattern for a
 * post-0005 table. Not `@ts-expect-error`, which would fail the build the day
 * the types are regenerated.
 */

type Row = Record<string, unknown>;

interface Filterable<T> extends PromiseLike<T> {
  eq(col: string, val: string): Filterable<T>;
}

interface NarrowDb {
  from(table: string): {
    select(cols: string): Filterable<{ data: Row[] | null; error: unknown }>;
    upsert(
      values: Record<string, unknown>,
      opts: { onConflict: string }
    ): PromiseLike<{ error: unknown }>;
    delete(): Filterable<{ error: unknown }>;
  };
}

function toSlot(r: Row): FinishMediaSlot | null {
  const kind = r.kind;
  const mediaKey = r.media_key;
  const src = r.src;
  if (kind !== 'swatch' && kind !== 'combination') return null;
  if (typeof mediaKey !== 'string' || typeof src !== 'string') return null;
  if (mediaKey.length === 0 || src.length === 0) return null;
  return {
    kind,
    mediaKey,
    src,
    alt: typeof r.alt === 'string' ? r.alt : '',
    caption: typeof r.caption === 'string' ? r.caption : '',
    sortOrder: typeof r.sort_order === 'number' ? r.sort_order : 0,
  };
}

/**
 * Everything for one vertical, in one query.
 *
 * ONE QUERY, NOT ONE PER SWATCH. The picker needs forty-odd swatches at once;
 * forty round trips on a public page is a slow first paint for data that
 * totals a few kilobytes. The caller indexes the result and looks up locally.
 */
export async function finishMediaFor(vertical = 'epoxy'): Promise<FinishMediaSlot[]> {
  try {
    const db = getSupabaseAdminClient() as unknown as NarrowDb;
    const { data, error } = await db.from('finish_media').select('*').eq('vertical', vertical);
    if (error || !data) return [];
    return data.map(toSlot).filter((s): s is FinishMediaSlot => s !== null);
  } catch {
    return [];
  }
}

/**
 * Indexed for lookup. Kind is part of the key because a swatch and a
 * combination could in principle carry the same string, and silently
 * returning the wrong one would be a picture of the wrong thing.
 */
export function indexByKey(slots: FinishMediaSlot[]): Map<string, FinishMediaSlot> {
  const m = new Map<string, FinishMediaSlot>();
  for (const s of slots) m.set(s.kind + '|' + s.mediaKey, s);
  return m;
}

/**
 * Upsert one picture.
 *
 * UPSERT rather than insert, on the unique index from 0022. Re-uploading a
 * swatch REPLACES it. The alternative — a second row for the same key — would
 * leave two pictures competing on sort order, and which one a visitor saw
 * would depend on nothing anybody chose.
 */
export async function saveFinishMedia(args: {
  vertical: string;
  kind: FinishMediaKind;
  mediaKey: string;
  src: string;
  alt: string;
  caption: string;
  sortOrder: number;
}): Promise<boolean> {
  try {
    const db = getSupabaseAdminClient() as unknown as NarrowDb;
    const { error } = await db.from('finish_media').upsert(
      {
        vertical: args.vertical,
        kind: args.kind,
        media_key: args.mediaKey,
        src: args.src,
        alt: args.alt,
        caption: args.caption,
        sort_order: args.sortOrder,
      },
      { onConflict: 'vertical,kind,media_key' }
    );
    return !error;
  } catch {
    return false;
  }
}

export async function deleteFinishMedia(args: {
  vertical: string;
  kind: FinishMediaKind;
  mediaKey: string;
}): Promise<boolean> {
  try {
    const db = getSupabaseAdminClient() as unknown as NarrowDb;
    const { error } = await db
      .from('finish_media')
      .delete()
      .eq('vertical', args.vertical)
      .eq('kind', args.kind)
      .eq('media_key', args.mediaKey);
    return !error;
  } catch {
    return false;
  }
}
