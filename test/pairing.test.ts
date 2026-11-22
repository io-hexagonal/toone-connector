import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/adapters/in/cli/cli.js';
import { BridgeClient } from '../src/adapters/out/bridge/bridge-client.js';
import { CredentialStore } from '../src/adapters/out/bridge/credential-store.js';
import { TooneAppPairingAdapter } from '../src/adapters/out/bridge/pairing-adapter.js';
import type { Connector } from '../src/application/ports/in/connector.js';
import { PairingService } from '../src/application/pairing-service.js';
import { ConnectorError } from '../src/domain/errors.js';
import { type FakeOptions, type FakeToone, started } from './fake-toone.js';

const SECRET = 'ab'.repeat(32);
let fake: FakeToone | null = null;
const clients: BridgeClient[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await fake?.close();
  fake = null;
});

async function toone(options: FakeOptions): Promise<FakeToone> {
  fake = await started(options);
  return fake;
}

function store(): CredentialStore {
  return new CredentialStore(join(mkdtempSync(join(tmpdir(), 'toone-connector-')), 'connector', 'credential.json'));
}

function client(app: FakeToone, credentials: CredentialStore, autoPair: boolean): BridgeClient {
  const bridge = new BridgeClient(app.port, { credentials, autoPair });
  clients.push(bridge);
  return bridge;
}

const workspaces = (bridge: BridgeClient) => bridge.call('agent', { op: 'desktop_workspaces', desktop: {} });

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return error instanceof ConnectorError ? error.code : String(error);
  }
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  expect(check()).toBe(true);
}

describe('pairing from the tool server', () => {
  it('asks Toone to pair, shows the code, then uses the credential it was given', async () => {
    const app = await toone({ version: 'current', allowUnpaired: true });
    const credentials = store();
    const bridge = client(app, credentials, true);

    await expect(workspaces(bridge)).rejects.toThrow(/code is 482913.*click Allow/);
    expect(app.pairingRequests).toEqual([{ name: 'Toone Connector', scope: 'control' }]);
    // Still waiting: asking again repeats the code without a second request.
    expect(await codeOf(workspaces(bridge))).toBe('PAIRING_PENDING');
    expect(app.pairingRequests).toHaveLength(1);
    expect(app.received).toHaveLength(0);

    await until(() => app.hasOpenRequest);
    app.decide('approved', 'read');
    await until(() => credentials.load() !== null);
    expect(credentials.load()).toMatchObject({ clientId: 'client-1', secret: SECRET, scope: 'read' });
    expect(statSync(credentials.file).mode & 0o777).toBe(0o600);
    expect(statSync(join(credentials.file, '..')).mode & 0o777).toBe(0o700);

    await expect(workspaces(bridge)).resolves.toEqual({ workspaces: [] });
    expect(app.received.map((r) => r.kind)).toEqual(['paired']);
    expect(bridge.connectionNote()).toBeUndefined();
    expect(readFileSync(credentials.file, 'utf8')).toContain('"version": 1');
  });

  it('respects a refusal and does not fall back to an unpaired connection', async () => {
    const app = await toone({ version: 'current', allowUnpaired: true });
    const credentials = store();
    const bridge = client(app, credentials, true);
    expect(await codeOf(workspaces(bridge))).toBe('PAIRING_PENDING');
    await until(() => app.hasOpenRequest);
    app.decide('denied');
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(workspaces(bridge)).rejects.toThrow(/declined.*toone-connector pair/);
    expect(credentials.load()).toBeNull();
    expect(app.received).toHaveLength(0);
  });

  it('falls back to the unpaired connection against a Toone that cannot pair, and says so', async () => {
    const app = await toone({ version: 'old' });
    const bridge = client(app, store(), true);
    await expect(workspaces(bridge)).resolves.toEqual({ workspaces: [] });
    expect(app.received.map((r) => r.kind)).toEqual(['unpaired']);
    expect(bridge.connectionNote()).toMatch(/without pairing.*cannot pair yet/);
  });
});

describe('a stored pairing', () => {
  it('refuses a program that holds the port but cannot prove the pairing', async () => {
    const app = await toone({ version: 'current', paired: { 'client-1': SECRET }, forgeServerProof: true });
    const credentials = store();
    credentials.save({ clientId: 'client-1', secret: SECRET, scope: 'control', pairedAt: '' });
    const bridge = client(app, credentials, true);
    await expect(workspaces(bridge)).rejects.toThrow(/could not prove/);
    expect(await codeOf(workspaces(bridge))).toBe('APP_NOT_VERIFIED');
    expect(app.received).toHaveLength(0);
  });

  it('refuses an older Toone (or anything else) that answers without the handshake', async () => {
    const app = await toone({ version: 'old' });
    const credentials = store();
    credentials.save({ clientId: 'client-1', secret: SECRET, scope: 'control', pairedAt: '' });
    expect(await codeOf(workspaces(client(app, credentials, false)))).toBe('APP_NOT_VERIFIED');
    expect(app.received).toHaveLength(0);
  });

  it('reports a revoked pairing', async () => {
    const app = await toone({ version: 'current', paired: {} });
    const credentials = store();
    credentials.save({ clientId: 'client-1', secret: SECRET, scope: 'control', pairedAt: '' });
    await expect(workspaces(client(app, credentials, true))).rejects.toThrow(/revoked.*toone-connector pair/);
  });

  it('reports a Toone that is not running', async () => {
    const app = await toone({ version: 'current' });
    const port = app.port;
    await app.close();
    fake = null;
    const bridge = new BridgeClient(port, { credentials: store(), autoPair: true });
    clients.push(bridge);
    expect(await codeOf(workspaces(bridge))).toBe('APP_NOT_RUNNING');
  });
});

describe('the command line', () => {
  it('connects unpaired when Toone allows it, and says the connection is not paired', async () => {
    const app = await toone({ version: 'current', allowUnpaired: true });
    const bridge = client(app, store(), false);
    await expect(workspaces(bridge)).resolves.toEqual({ workspaces: [] });
    expect(app.pairingRequests).toHaveLength(0);
    expect(bridge.connectionNote()).toMatch(/not paired.*toone-connector pair/);
  });

  it('explains how to pair when Toone only accepts paired apps', async () => {
    const app = await toone({ version: 'current', allowUnpaired: false });
    expect(await codeOf(workspaces(client(app, store(), false)))).toBe('PAIRING_REQUIRED');
  });

  it('pairs with `pair`, waits for the answer, and forgets with `unpair`', async () => {
    const app = await toone({ version: 'current', allowUnpaired: false });
    const credentials = store();
    const bridge = client(app, credentials, false);
    const pairing = new PairingService(new TooneAppPairingAdapter(bridge, credentials));
    const lines: string[] = [];
    const done = runCli({} as Connector, ['pair', '--read-only'], (line) => lines.push(line), pairing);
    await until(() => app.hasOpenRequest);
    expect(lines[0]).toMatch(/code 482913/);
    expect(app.pairingRequests).toEqual([{ name: 'Toone Connector', scope: 'read' }]);
    app.decide('approved', 'read');
    expect(await done).toBe(0);
    expect(lines.at(-1)).toBe('Paired. Toone allows this connector to read only.');
    expect(pairing.state()).toMatchObject({ paired: true, scope: 'read' });

    // The same client now connects paired, although unpaired callers are refused.
    await expect(workspaces(bridge)).resolves.toEqual({ workspaces: [] });
    expect(app.received.map((r) => r.kind)).toEqual(['paired']);

    expect(await runCli({} as Connector, ['unpair'], (line) => lines.push(line), pairing)).toBe(0);
    expect(lines.at(-1)).toMatch(/Forgot.*Connected Apps/);
    expect(credentials.load()).toBeNull();
  });

  it('reports a declined `pair` and a Toone that cannot pair', async () => {
    const app = await toone({ version: 'current' });
    const credentials = store();
    const pairing = new PairingService(new TooneAppPairingAdapter(client(app, credentials, false), credentials));
    const lines: string[] = [];
    const done = runCli({} as Connector, ['pair'], (line) => lines.push(line), pairing);
    await until(() => app.hasOpenRequest);
    app.decide('denied');
    expect(await done).toBe(1);
    expect(lines.at(-1)).toMatch(/declined/);
    expect(credentials.load()).toBeNull();

    await app.close();
    fake = await started({ version: 'old' });
    const old = new PairingService(new TooneAppPairingAdapter(client(fake, credentials, false), credentials));
    expect(await runCli({} as Connector, ['pair'], (line) => lines.push(line), old)).toBe(1);
    expect(lines.at(-1)).toMatch(/cannot pair yet/);
  });
});

describe('the credential file', () => {
  it('ignores a damaged file and tightens loose permissions', () => {
    const credentials = store();
    credentials.save({ clientId: 'client-1', secret: SECRET, scope: 'control', pairedAt: '' });
    writeFileSync(credentials.file, JSON.stringify({ version: 1, clientId: 'c', secret: 'not-hex' }), { mode: 0o644 });
    expect(credentials.load()).toBeNull();
    writeFileSync(credentials.file, JSON.stringify({ version: 1, clientId: 'c', secret: SECRET, scope: 'anything' }), { mode: 0o644 });
    expect(credentials.load()).toMatchObject({ clientId: 'c', scope: 'read' });
    expect(statSync(credentials.file).mode & 0o777).toBe(0o600);
    expect(credentials.remove()).toBe(true);
    expect(credentials.remove()).toBe(false);
  });
});
