import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Remembers one request id per workspace, so the connector reuses its single
 * "External Operator" conversation in Toone instead of opening a new one on every start.
 */
export class OperatorStore {
  private ids: Record<string, string> | null = null;

  constructor(private readonly file: string) {}

  idFor(workspaceId: string): string {
    const ids = this.load();
    const known = ids[workspaceId];
    if (known) return known;
    const fresh = randomUUID();
    ids[workspaceId] = fresh;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, `${JSON.stringify({ operators: ids }, null, 2)}\n`, { mode: 0o600 });
    } catch {
      // Not being able to save only means a new conversation next time.
    }
    return fresh;
  }

  private load(): Record<string, string> {
    if (this.ids) return this.ids;
    this.ids = existsSync(this.file) ? parseOperators(readFileSync(this.file, 'utf8')) : {};
    return this.ids;
  }
}

function parseOperators(text: string): Record<string, string> {
  try {
    return (JSON.parse(text) as { operators?: Record<string, string> }).operators ?? {};
  } catch {
    return {}; // A damaged file only costs one new conversation in Toone.
  }
}
