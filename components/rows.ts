// Shared helpers for Realtime-backed row lists (one row per id).

export type Row = { id: string; created_at: string };

/** Insert or replace by id, keeping the list newest first. */
export function upsertNewest<T extends Row>(list: T[], row: T): T[] {
  const i = list.findIndex((r) => r.id === row.id);
  if (i === -1) return [row, ...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const next = list.slice();
  next[i] = row;
  return next;
}

/** Loaded rows plus anything Realtime delivered meanwhile (those are at least as new). */
export function mergeNewest<T extends Row>(loaded: T[], seen: T[]): T[] {
  return seen.reduce(upsertNewest, loaded);
}
