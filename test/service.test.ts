import { describe, expect, it, vi } from 'vitest';
import { ConnectorService } from '../src/application/connector-service.js';
import type { TooneAppPort } from '../src/application/ports/out/toone-app.js';
import { toActiveRuns, toRunDetail } from '../src/adapters/out/bridge/mappers.js';

function fakeApp(): TooneAppPort {
  return {
    workspaces: async () => [{ id: 'w', name: 'growth', projectPath: '/p', loaded: true, selectedInApp: true }],
    routines: async () => [{ id: 'a/radar', name: 'Reddit Radar', department: 'a', owner: 'o', parentId: null, needsRepair: false }],
    liveStatus: async () => ({ runs: [], blocked: [] }),
    recentRuns: async () => [],
    runDetail: async () => ({ runId: 'r', routineId: 'a/radar', routineName: 'Reddit Radar', status: 'completed', startedAt: null, endedAt: null, lastStep: null, steps: [] }),
    recordBooks: async () => [],
    findRecords: async () => ({ total: 0, byStatus: {}, records: [] }),
    start: vi.fn(async (_w, routineId) => ({ routineId, requestId: 'q', state: 'accepted', awaitingInputIds: [] })),
    control: vi.fn(async () => 'ok'),
    supplyInputs: vi.fn(async () => 'ok'),
    createRoutine: vi.fn(async () => ({ status: 'started' as const, draftId: 'd', threadId: 't', message: 'm' })),
    startSetup: vi.fn(async () => ({ status: 'started' as const, threadId: 't', revisionId: 'r', title: 'x', message: 'm' })),
    close: async () => {},
  };
}

describe('ConnectorService actions', () => {
  it('starts nothing when the person says no', async () => {
    const app = fakeApp();
    const service = new ConnectorService(app, '/p');
    await expect(service.start({ routine: 'radar' }, async () => false)).rejects.toThrow(/Not confirmed/);
    expect(app.start).not.toHaveBeenCalled();
  });
  it('asks with the routine name, then starts the resolved routine', async () => {
    const app = fakeApp();
    const asked: string[] = [];
    const receipt = await new ConnectorService(app, '/p').start({ routine: 'radar' }, async (ask) => (asked.push(ask.title), true));
    expect(asked[0]).toBe('Run "Reddit Radar" in growth?');
    expect(receipt.routineId).toBe('a/radar');
    expect(app.start).toHaveBeenCalledOnce();
  });
  it('controls and answers only after a yes', async () => {
    const app = fakeApp();
    const service = new ConnectorService(app, '/p');
    await expect(service.control({ runId: 'r', action: 'cancel' }, async () => false)).rejects.toThrow();
    await expect(service.answer({ executionId: 'e', inputs: { a: 'b' } }, async () => false)).rejects.toThrow();
    expect(app.control).not.toHaveBeenCalled();
    expect(app.supplyInputs).not.toHaveBeenCalled();
  });
  it('names the waiting routine when asking to answer it', async () => {
    const app = fakeApp();
    app.liveStatus = async () => ({ runs: toActiveRuns({ routines: { runs: [{ runId: 'r', routineId: 'a/radar', routineName: 'Reddit Radar', status: 'awaitingInput',
      invocations: [{ awaitingExecutionId: 'e', currentSteps: [{ stepId: 's1', title: 'Pick', missingInputIds: ['topic'] }] }] }] } }), blocked: [] });
    const asked: string[] = [];
    await new ConnectorService(app, '/p').answer({ executionId: 'e', inputs: { topic: 'x' } }, async (ask) => (asked.push(ask.title), true));
    expect(asked[0]).toBe('Send this answer to "Reddit Radar"?');
    expect(app.supplyInputs).toHaveBeenCalledOnce();
  });
});

describe('bridge mappers', () => {
  it('reads active runs with their controls and missing inputs', () => {
    const runs = toActiveRuns({ routines: { runs: [{ runId: 'r', routineId: 'a/b', routineName: 'B', status: 'paused', currentBoundary: 'Paused',
      controls: { canContinue: true, canCancel: true, heldSteps: [{ title: 'Send' }] },
      invocations: [{ currentSteps: [{ executionId: 'e', title: 'Pick', missingInputIds: ['topic'] }] }] }] } });
    expect(runs[0]).toMatchObject({ canContinue: true, canPause: false, heldSteps: ['Send'], awaiting: [{ executionId: 'e', missingInputIds: ['topic'] }] });
  });
  it('takes the waiting execution id from the invocation, as the app reports it', () => {
    const runs = toActiveRuns({ routines: { runs: [{ runId: 'r', routineId: 'a/b', status: 'awaitingInput', awaitingExecutionIds: ['t1'],
      invocations: [{ threadId: 't1', awaitingExecutionId: 't1', phase: 'awaitingInput', currentSteps: [{ stepId: 's1', title: 'Pick', phase: 'awaitingInput', missingInputIds: ['topic'] }] }] }] } });
    expect(runs[0]?.awaiting).toEqual([{ executionId: 't1', stepTitle: 'Pick', missingInputIds: ['topic'] }]);
  });
  it('turns a large run snapshot into one short line per step, in order', () => {
    const detail = toRunDetail({ run: { runId: 'r', name: 'B', status: 'completed' }, codeSteps: [{ stepId: 's1', title: 'Read' }],
      invocationSnapshots: [{ snapshot: { stages: [
        { id: 's1', kind: 'code', title: 'Read', phase: 'succeeded', resultSummary: 'Read 5 pages.' },
        { id: 's2', kind: 'agent', title: 'Decide', phase: 'succeeded', resultSummary: 'x'.repeat(900) }] } }] }, 'r', undefined);
    expect(detail.steps.map((s) => s.kind)).toEqual(['script', 'agent']);
    expect(detail.steps[1]?.summary?.length).toBe(300);
    expect(detail.routineName).toBe('B');
  });
  it('says why a step failed when it has no result summary', () => {
    const detail = toRunDetail({ run: { runId: 'r', status: 'failed' }, invocationSnapshots: [{ snapshot: { stages: [
      { id: 's1', title: 'Read', phase: 'failed', resultStatus: 'failed', reason: 'Could not start.' }] } }] }, 'r', undefined);
    expect(detail.steps[0]).toMatchObject({ state: 'failed', summary: 'Could not start.' });
  });
});
