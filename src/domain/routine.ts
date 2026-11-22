import { ConnectorError } from './errors.js';

export interface Routine {
  id: string;
  name: string;
  department: string;
  owner: string;
  /** Set when this routine only runs as part of another one. */
  parentId: string | null;
  needsRepair: boolean;
}

export function searchRoutines(all: Routine[], search: string | undefined): Routine[] {
  if (!search) return all;
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  return all.filter((r) => {
    const hay = `${r.id} ${r.name} ${r.department}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Resolves what a person typed ("reddit radar", or an exact id) to exactly one routine. */
export function resolveRoutine(all: Routine[], wanted: string): Routine {
  const needle = wanted.trim().toLowerCase();
  const exact = all.filter((r) => r.id.toLowerCase() === needle || r.name.toLowerCase() === needle);
  const hits = exact.length > 0 ? exact : searchRoutines(all, wanted);
  if (hits.length === 1 && hits[0]) return hits[0];
  if (hits.length === 0) throw new ConnectorError('ROUTINE_NOT_FOUND', `No routine matches "${wanted}".`);
  throw new ConnectorError(
    'ROUTINE_AMBIGUOUS',
    `"${wanted}" matches ${hits.length} routines: ${hits.slice(0, 8).map((r) => `${r.name} (${r.id})`).join('; ')}. Use the exact id.`,
  );
}
