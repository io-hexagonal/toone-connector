import { clip } from './text.js';

/** A saved list a routine keeps so it never handles the same thing twice. */
export interface RecordBook {
  id: string;
  name: string;
  purpose: string;
  records: number;
  usedBy: string[];
}

export interface HandledRecord {
  key: string;
  status: string | null;
  updatedAt: string | null;
  fields: Record<string, string>;
}

export interface HandledPage {
  book: string;
  total: number;
  returned: number;
  byStatus: Record<string, number>;
  records: HandledRecord[];
}

export interface RecordQuery {
  book: string;
  status?: string;
  limit: number;
}

export interface RecordResult {
  total: number;
  byStatus: Record<string, number>;
  records: HandledRecord[];
}

const FIELD_LIMIT = 120;
const MAX_FIELDS = 8;

/** Keeps a record small: at most eight short fields. */
export function slimFields(fields: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(fields).slice(0, MAX_FIELDS)) {
    if (value === null || value === undefined || value === '') continue;
    out[name] = clip(value, FIELD_LIMIT);
  }
  return out;
}

/** True when any field of the record contains every search word. */
export function recordMatches(record: HandledRecord, search: string | undefined): boolean {
  if (!search) return true;
  const hay = `${record.key} ${Object.values(record.fields).join(' ')}`.toLowerCase();
  return search.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
