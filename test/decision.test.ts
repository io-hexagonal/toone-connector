import { describe, expect, it, vi } from 'vitest';
import { toHeldSteps } from '../src/adapters/out/bridge/held-steps.js';
import { toActiveRuns } from '../src/adapters/out/bridge/mappers.js';
import { ConnectorService } from '../src/application/connector-service.js';
import type { TooneAppPort } from '../src/application/ports/out/toone-app.js';
import { HELD_STEP_CHOICES, retryAsk } from '../src/domain/decision.js';
import type { ActiveRun } from '../src/domain/run.js';
import { collectWaiting } from '../src/domain/waiting.js';

const run = (over: Partial<ActiveRun>): ActiveRun => ({
  runId: 'r1', routineId: 'a/b', routineName: 'Reddit Radar', status: 'running', startedAt: null, endedAt: null, lastStep: null,
  canPause: true, canContinue: true, canCancel: true, awaiting: [], heldSteps: [], ...over,
});

// A run as the app's status answer reports it while a failed step waits for the person.
const heldRun = {
  runId: 'r1', routineId: 'a/b', routineName: 'Reddit Radar', status: 'running',
  controls: {
    canContinue: true, canCancel: true,
    heldSteps: [
      { stepId: 'step-fetch', threadId: 't1', reason: 'The file data.json is missing.', heldAt: '2026-11-22T10:00:00Z' },
      { stepId: 'step-sync', threadId: null, kind: 'code', reason: 'The script exited with 2.', heldAt: '2026-11-22T10:01:00Z' },
    ],
    waitingAutomaticSteps: [{ stepId: 'step-sync', title: 'Sync the sheet', kind: 'code' }],
  },
  invocations: [{ currentSteps: [{ stepId: 'step-fetch', title: 'Fetch the threads', missingInputIds: [] }] }],
};

describe('held steps from the app', () => {
  it('names each held step by its title and keeps why it failed', () => {
    expect(toHeldSteps(heldRun)).toEqual([
      { step: 'Fetch the threads', reason: 'The file data.json is missing.', automatic: false },
      { step: 'Sync the sheet', reason: 'The script exited with 2.', automatic: true },
    ]);
    const [active] = toActiveRuns({ routines: { runs: [heldRun] } });
    expect(active?.heldSteps).toEqual(['Fetch the threads', 'Sync the sheet']);
  });
});

describe('the decision in toone_waiting', () => {
  it('lists each held step with the reason and the three choices', () => {
    const items = collectWaiting([run({ held: [{ step: 'Fetch', reason: 'data.json is missing', automatic: false }], heldSteps: ['Fetch'] })], []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'failed_step', what: 'Step "Fetch" failed: data.json is missing. Held until you decide.', choices: HELD_STEP_CHOICES });
    expect(Object.keys(items[0]?.choices ?? {})).toEqual(['retry', 'fix', 'stop']);
  });
  it('still offers the choices when the app gave no reason', () => {
    const [item] = collectWaiting([run({ heldSteps: ['step-fetch'] })], []);
    expect(item?.what).toBe('Step "step-fetch" failed. Held until you decide.');
    expect(item?.choices?.retry).toContain('toone_control continue');
  });
});

describe('making the decision', () => {
  function app(live: ActiveRun[]): TooneAppPort {
    return {
      workspaces: async () => [{ id: 'w', name: 'growth', projectPath: '/p', loaded: true, selectedInApp: true }],
      liveStatus: async () => ({ runs: live, blocked: [] }),
      control: vi.fn(async () => 'continuing'),
    } as unknown as TooneAppPort;
  }
  it('asks "retry" for a continue on a run with a held step, and does nothing on a no', async () => {
    const live = [run({ held: [{ step: 'Fetch', reason: null, automatic: false }], heldSteps: ['Fetch'] })];
    const fake = app(live);
    const asked: string[] = [];
    await expect(new ConnectorService(fake, '/p').control({ runId: 'r1', action: 'continue' }, async (a) => (asked.push(a.title), false))).rejects.toThrow(/Not confirmed/);
    expect(asked).toEqual(['Retry "Fetch" in "Reddit Radar"?']);
    expect(fake.control).not.toHaveBeenCalled();
    await new ConnectorService(fake, '/p').control({ runId: 'r1', action: 'continue' }, async () => true);
    expect(fake.control).toHaveBeenCalledWith(expect.anything(), 'r1', 'continue');
  });
  it('keeps the plain question for a paused run with nothing held, and for stop', async () => {
    expect(retryAsk(run({ status: 'paused' }))).toBeNull();
    const asked: string[] = [];
    const live = [run({ heldSteps: ['Fetch'] })];
    await new ConnectorService(app(live), '/p').control({ runId: 'r1', action: 'cancel' }, async (a) => (asked.push(a.title), true));
    expect(asked).toEqual(['Cancel "Reddit Radar"?']);
  });
});
