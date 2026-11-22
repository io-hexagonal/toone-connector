import { describe, expect, it, vi } from 'vitest';
import type { BridgeClient } from '../src/adapters/out/bridge/bridge-client.js';
import type { OperatorStore } from '../src/adapters/out/bridge/operator-store.js';
import { TooneAppAdapter } from '../src/adapters/out/bridge/toone-app-adapter.js';

const ws = { id: 'w', name: 'growth', projectPath: '/p', loaded: true, selectedInApp: true };
const operators = { idFor: () => 'op' } as unknown as OperatorStore;

/** A bridge that accepts the control, then reports it as `settled` on the next status read. */
function bridge(settled: { state: string; error?: string }) {
  const call = vi.fn(async (command: string, params: Record<string, unknown>) => {
    if (params.op === 'desktop_context') return { threadId: 't', agentId: 'a' };
    if (command === 'routine_runtime') return { operationId: 'op-1', state: 'accepted', runId: 'r' };
    return { routines: { runs: [], recentControls: [{ operationId: 'op-1', runId: 'r', state: settled.state, error: settled.error ?? null }] } };
  });
  return { call, close: async () => {} } as unknown as BridgeClient & { call: typeof call };
}

describe('run controls', () => {
  it('waits until Toone has applied the control', async () => {
    vi.useFakeTimers();
    const adapter = new TooneAppAdapter(bridge({ state: 'completed' }), operators);
    const done = adapter.control(ws, 'r', 'pause');
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(done).resolves.toBe('Paused.');
    vi.useRealTimers();
  });
  it('reports a control Toone accepted but could not apply as a failure', async () => {
    vi.useFakeTimers();
    const adapter = new TooneAppAdapter(bridge({ state: 'failed', error: 'No work was resumed.' }), operators);
    const done = adapter.control(ws, 'r', 'continue');
    const settled = expect(done).rejects.toThrow(/could not continue the run: No work was resumed/);
    await vi.advanceTimersByTimeAsync(1_000);
    await settled;
    vi.useRealTimers();
  });
});
