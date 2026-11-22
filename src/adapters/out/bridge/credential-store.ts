import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PairScope } from '../../../domain/pairing.js';

/** What Toone handed this connector when the person allowed it. */
export interface StoredCredential {
  clientId: string;
  /** 64 lowercase hex characters. Never sent over the socket; only used to sign. */
  secret: string;
  scope: PairScope;
  pairedAt: string;
}

const SECRET = /^[0-9a-f]{64}$/;

/**
 * Keeps the pairing in one file readable only by this macOS user (0600, in a 0700 folder).
 * Other software running as the same user can still read it; see SECURITY.md.
 */
export class CredentialStore {
  constructor(readonly file: string) {}

  load(): StoredCredential | null {
    if (!existsSync(this.file)) return null;
    if ((statSync(this.file).mode & 0o077) !== 0) chmodSync(this.file, 0o600);
    const text = readFileSync(this.file, 'utf8');
    try {
      return parse(text);
    } catch (error) {
      if (error instanceof SyntaxError) return null; // a damaged file means pairing again
      throw error;
    }
  }

  save(credential: StoredCredential): void {
    const folder = dirname(this.file);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    chmodSync(folder, 0o700);
    const temporary = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, ...credential }, null, 2)}\n`, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, this.file);
  }

  remove(): boolean {
    if (!existsSync(this.file)) return false;
    rmSync(this.file, { force: true });
    return true;
  }
}

function parse(text: string): StoredCredential | null {
  const value = JSON.parse(text) as Partial<StoredCredential> & { version?: number };
  if (value.version !== 1 || typeof value.clientId !== 'string' || !value.clientId) return null;
  if (typeof value.secret !== 'string' || !SECRET.test(value.secret)) return null;
  // Toone enforces the scope; this copy is only shown to the person.
  const scope: PairScope = value.scope === 'control' ? 'control' : 'read';
  return { clientId: value.clientId, secret: value.secret, scope, pairedAt: typeof value.pairedAt === 'string' ? value.pairedAt : '' };
}
