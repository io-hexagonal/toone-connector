import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLinks } from '../src/adapters/out/bridge/app-links.js';
import { BridgeClient } from '../src/adapters/out/bridge/bridge-client.js';
import { CredentialStore } from '../src/adapters/out/bridge/credential-store.js';
import { OperatorStore } from '../src/adapters/out/bridge/operator-store.js';
import { TooneAppAdapter } from '../src/adapters/out/bridge/toone-app-adapter.js';
import { ConnectorService } from '../src/application/connector-service.js';
import { ExploreService } from '../src/application/explore-service.js';
import type { ExploreCatalogPort } from '../src/application/ports/out/explore-catalog.js';
import { ConnectorError } from '../src/domain/errors.js';
import type { ExploreDetail } from '../src/domain/explore.js';
import { type FakeOptions, type FakeReply, type FakeToone, started } from './fake-toone.js';

/**
 * Making a routine and installing from Explore, over a real bridge connection to a stand-in for
 * Toone that answers with the app's wire shapes.
 */
const SECRET = 'ab'.repeat(32);
const WORKSPACE = { workspaceId: 'w-1', name: 'growth', projectPath: '/p/growth', loaded: true, selectedInUI: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let fake: FakeToone | null = null;
const bridges: BridgeClient[] = [];
afterEach(async () => {
  await Promise.all(bridges.splice(0).map((b) => b.close()));
  await fake?.close();
  fake = null;
});

type Answer = (params: Record<string, unknown>, desktop: Record<string, unknown>) => FakeReply | undefined;

/** `link`: how the connector reaches Toone. 'old' is a Toone from before pairing and the new operations. */
async function wire(link: 'paired' | 'read-only' | 'unpaired' | 'old', answer: Answer = () => undefined) {
  const folder = mkdtempSync(join(tmpdir(), 'toone-flows-'));
  const credentials = new CredentialStore(join(folder, 'credential.json'));
  const paired = link === 'paired' || link === 'read-only';
  if (paired) credentials.save({ clientId: 'client-1', secret: SECRET, scope: link === 'read-only' ? 'read' : 'control', pairedAt: '' });
  const options: FakeOptions = {
    version: link === 'old' ? 'old' : 'current',
    allowUnpaired: true,
    paired: { 'client-1': SECRET },
    answer: (params, kind) => {
      const op = String(params.op);
      const desktop = (params.desktop ?? {}) as Record<string, unknown>;
      if (op === 'desktop_workspaces') return { payload: { workspaces: [WORKSPACE] } };
      if (op === 'desktop_context') return undefined;
      // The app's paired allowlist: no app details for paired programs, no actions for read-only ones.
      if (kind === 'paired' && op === 'desktop_diagnostics') return { refuse: { errorCode: 'PAIRED_SCOPE_UNSUPPORTED', error: 'Connected apps cannot use agent desktop_diagnostics.' } };
      if (link === 'read-only' && ['desktop_create_routine', 'desktop_start_setup', 'desktop_navigate'].includes(op)) {
        return { refuse: { errorCode: 'PAIRED_READ_ONLY', error: 'Toone Connector is connected to Toone read only.' } };
      }
      const custom = answer(params, desktop);
      if (custom) return custom;
      if (link === 'old' && (op === 'desktop_create_routine' || op === 'desktop_start_setup')) {
        return { error: { code: 'UNKNOWN_AGENT_OPERATION', message: `Unknown agent bridge operation '${op}'.` } };
      }
      if (op === 'desktop_diagnostics') return { payload: { executablePath: '/Apps/Toone.app/Contents/MacOS/Toone' } };
      return undefined;
    },
  };
  fake = await started(options);
  const bridge = new BridgeClient(fake.port, { credentials });
  bridges.push(bridge);
  const app = new TooneAppAdapter(bridge, new OperatorStore(join(folder, 'state.json')));
  const openWith = vi.fn(async () => {});
  const catalog: ExploreCatalogPort = {
    search: async () => ({ routines: [], bundles: [] }),
    detail: async (ref) => detail(ref.kind, ref.id),
  };
  return {
    fake,
    openWith,
    connector: new ConnectorService(app, '/p/growth'),
    explore: new ExploreService(app, catalog, new AppLinks(bridge, (ws) => app.identityFor(ws), openWith), '/p/growth'),
    ops: () => fake!.received.map((r) => String(r.message.command?.params.op)),
    sent: (op: string) => fake!.received.filter((r) => r.message.command?.params.op === op),
  };
}

function detail(kind: 'routine' | 'bundle', id: string): ExploreDetail {
  return {
    kind, id, title: kind === 'routine' ? 'Apply to Grants' : 'Grants Kit', summary: 's', price: 'Free', by: 'Ana', codeFiles: true,
    steps: 3, routines: kind === 'bundle' ? ['A', 'B'] : [], youProvide: [], prepare: null, thirdParties: [],
  };
}

const yes = async () => true;
const ROUTINE = 'wfl_abcdefgh12';
const BUNDLE = 'wfb_mq35pytutf7lj72j';
const DESCRIPTION = 'Every Monday, list the five most relevant Product Hunt launches.';
const drafted = (status: string) => ({
  payload: { status, draftId: 'd-1', threadId: 'th-9', message: 'Toone is drafting it.', workspace: WORKSPACE, snapshotAt: '' },
});

async function failure(promise: Promise<unknown>): Promise<ConnectorError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ConnectorError) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

describe('making a routine', () => {
  it('asks first, naming the project and quoting the description, then hands it to Toone', async () => {
    const t = await wire('paired', (p) => (p.op === 'desktop_create_routine' ? drafted('started') : undefined));
    const asked: string[] = [];
    const done = await t.connector.makeRoutine({ description: `  ${DESCRIPTION}  ` }, async (ask) => (asked.push(`${ask.title} ${ask.detail}`), true));
    expect(asked[0]).toMatch(/^Make a routine in growth\? .*"Every Monday, list the five/);
    expect(done).toMatchObject({ workspace: 'growth', status: 'started', draftId: 'd-1', toone: 'Toone is drafting it.' });
    expect(done.next).toMatch(/started drafting.*publish it in Toone/);
    const [sent] = t.sent('desktop_create_routine');
    expect(sent?.kind).toBe('paired');
    expect(sent?.message).toMatchObject({ threadId: 't-1', agentId: 'operator' });
    expect(sent?.message.command?.params.desktop).toMatchObject({ workspaceId: 'w-1', description: DESCRIPTION, clientRequestId: expect.stringMatching(UUID) });
  });

  it('sends nothing on a no, or for an empty description', async () => {
    const t = await wire('paired');
    expect((await failure(t.connector.makeRoutine({ description: DESCRIPTION }, async () => false))).code).toBe('NOT_CONFIRMED');
    expect((await failure(t.connector.makeRoutine({ description: '  ' }, yes))).code).toBe('INVALID_REQUEST');
    expect(t.ops()).not.toContain('desktop_create_routine');
  });

  it('asks again with the same request id when the answer is lost, and says Toone reused the draft', async () => {
    let calls = 0;
    const t = await wire('paired', (p) => {
      if (p.op !== 'desktop_create_routine') return undefined;
      calls += 1;
      return calls === 1 ? 'drop' : drafted('reused');
    });
    const done = await t.connector.makeRoutine({ description: DESCRIPTION }, yes);
    expect(done.status).toBe('reused');
    expect(done.next).toMatch(/already started this draft/);
    const keys = t.sent('desktop_create_routine').map((r) => (r.message.command?.params.desktop as { clientRequestId: string }).clientRequestId);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("reports Toone's plan limit plainly", async () => {
    const t = await wire('paired', (p) =>
      p.op === 'desktop_create_routine' ? { error: { code: 'ROUTINE_CREATION_LIMIT', message: 'The free plan includes 3 routines.' } } : undefined);
    const error = await failure(t.connector.makeRoutine({ description: DESCRIPTION }, yes));
    expect(error.code).toBe('ROUTINE_LIMIT');
    expect(error.message).toMatch(/limit on routines.*nothing was drafted.*The free plan includes 3 routines/);
  });

  it('says how to allow it when the connector is paired read only', async () => {
    const t = await wire('read-only');
    const error = await failure(t.connector.makeRoutine({ description: DESCRIPTION }, yes));
    expect(error.code).toBe('PAIRED_READ_ONLY');
    expect(error.message).toMatch(/paired read only.*toone-connector pair.*May start and control routines/);
  });

  it('says plainly when the running Toone is too old to take a description', async () => {
    const t = await wire('old');
    const error = await failure(t.connector.makeRoutine({ description: DESCRIPTION }, yes));
    expect(error.code).toBe('NOT_SUPPORTED_BY_APP');
    expect(error.message).toMatch(/cannot take a routine description/);
  });
});

describe('installing from Explore', () => {
  const setup = (status: string): FakeReply => ({
    payload: { status, threadId: 'th-5', listingKind: 'routine', listingId: ROUTINE, revisionId: 'wfr_1', title: 'Apply to Grants', message: 'The setup conversation is open in Toone.', workspace: WORKSPACE },
  });

  it("starts Toone's setup for a routine, and opens nothing", async () => {
    const t = await wire('paired', (p) => (p.op === 'desktop_start_setup' ? setup('started') : undefined));
    const done = await t.explore.install({ listing: ROUTINE }, yes);
    expect(done).toMatchObject({ how: 'setup', project: 'growth', toone: 'The setup conversation is open in Toone.' });
    expect(done.next).toMatch(/started setting up "Apply to Grants" in growth.*code files.*Nothing is installed until you finish/);
    expect(t.sent('desktop_start_setup')[0]?.message.command?.params.desktop).toMatchObject({ workspaceId: 'w-1', listingKind: 'routine', listingId: ROUTINE });
    expect(t.openWith).not.toHaveBeenCalled();
  });

  it('says so when Toone had already started that setup', async () => {
    const t = await wire('unpaired', (p) => (p.op === 'desktop_start_setup' ? setup('reused') : undefined));
    expect((await t.explore.install({ listing: ROUTINE }, yes)).next).toMatch(/already started setting up/);
  });

  it("passes on Toone's refusal of a routine's setup", async () => {
    const t = await wire('paired', (p) => (p.op === 'desktop_start_setup' ? { error: { code: 'SETUP_REFUSED', message: 'This routine has automatic steps.' } } : undefined));
    const error = await failure(t.explore.install({ listing: ROUTINE }, yes));
    expect(error.code).toBe('SETUP_REFUSED');
    expect(error.message).toMatch(/This routine has automatic steps/);
    expect(t.openWith).not.toHaveBeenCalled();
  });

  it('opens the listing page in an older Toone, and says why', async () => {
    const t = await wire('old');
    const done = await t.explore.install({ listing: ROUTINE }, yes);
    expect(t.ops()).toContain('desktop_start_setup');
    expect(t.openWith).toHaveBeenCalledWith('/Apps/Toone.app', `toone://explore/routines/${ROUTINE}`);
    expect(done.how).toBe('page');
    expect(done.next).toMatch(/cannot start setup from the connector.*press "Use this routine"/);
  });

  it('opens a bundle page when unpaired; bundles have no setup conversation', async () => {
    const t = await wire('unpaired');
    const done = await t.explore.install({ listing: BUNDLE }, yes);
    expect(t.ops()).not.toContain('desktop_start_setup');
    expect(t.openWith).toHaveBeenCalledWith('/Apps/Toone.app', `toone://explore/bundles/${BUNDLE}`);
    expect(done).toMatchObject({ how: 'page' });
    expect(done.next).toMatch(/Toone now shows it in Explore.*"Use this bundle"/);
  });

  it('has Toone offer a bundle page when paired, without asking for app details', async () => {
    const t = await wire('paired', (p) => (p.op === 'desktop_navigate' ? { payload: { status: 'offered', target: 'explore' } } : undefined));
    const done = await t.explore.install({ listing: BUNDLE }, yes);
    expect(t.ops()).not.toContain('desktop_diagnostics');
    expect(t.openWith).not.toHaveBeenCalled();
    const [nav] = t.sent('desktop_navigate');
    expect(nav?.message).toMatchObject({ threadId: 't-1' });
    expect(nav?.message.command?.params.desktop).toMatchObject({ workspaceId: 'w-1', target: 'explore', listingKind: 'bundle', listingId: BUNDLE });
    expect(done).toMatchObject({ how: 'offer' });
    expect(done.next).toMatch(/notice with an "Open" button.*"Use this bundle"/);
  });

  it('says where to find the listing when a paired Toone cannot show it', async () => {
    const t = await wire('paired', (p) =>
      p.op === 'desktop_navigate' ? { error: { code: 'INVALID_NAVIGATION_TARGET', message: 'Use workspace, routine, run, thread or draft.' } } : undefined);
    const error = await failure(t.explore.install({ listing: BUNDLE }, yes));
    expect(error.code).toBe('NOT_SUPPORTED_BY_APP');
    expect(error.message).toMatch(/Nothing was installed.*open Explore in growth.*"Grants Kit" \(wfb_/);
  });

  it('says how to allow installs when the connector is paired read only', async () => {
    const t = await wire('read-only');
    expect((await failure(t.explore.install({ listing: ROUTINE }, yes))).code).toBe('PAIRED_READ_ONLY');
    expect((await failure(t.explore.install({ listing: BUNDLE }, yes))).code).toBe('PAIRED_READ_ONLY');
    expect(t.openWith).not.toHaveBeenCalled();
  });
});
