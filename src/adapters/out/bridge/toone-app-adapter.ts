import { randomUUID } from 'node:crypto';
import type { TooneAppPort } from '../../../application/ports/out/toone-app.js';
import { ConnectorError } from '../../../domain/errors.js';
import type { RecordBook, RecordQuery, RecordResult } from '../../../domain/records.js';
import type { Routine } from '../../../domain/routine.js';
import type { RunControlAction, RunDetail, RunSummary, StartReceipt } from '../../../domain/run.js';
import type { LiveStatus } from '../../../domain/waiting.js';
import type { Workspace } from '../../../domain/workspace.js';
import type { BridgeClient, BridgeIdentity } from './bridge-client.js';
import {
  findControlState,
  toActiveRuns,
  toBlockedThreads,
  toByStatus,
  toControlMessage,
  toControlState,
  toRecentRuns,
  toRecordBooks,
  toRecords,
  toRoutines,
  toRunDetail,
  toStartReceipt,
  toWorkspaces,
} from './mappers.js';
import type { OperatorStore } from './operator-store.js';

const LABEL = 'Toone Connector';
const STATUS_PAGE = 50;
const CONTROL_SETTLE_MS = 20_000;
const CONTROL_POLL_MS = 1_000;
const PENDING_CONTROL = new Set(['accepted', 'applying']);
const DONE: Record<RunControlAction, string> = { pause: 'Paused.', continue: 'Continued.', cancel: 'Cancelled.' };

/** Speaks the Toone app's loopback bridge on behalf of the connector. */
export class TooneAppAdapter implements TooneAppPort {
  private readonly identities = new Map<string, BridgeIdentity>();
  private generation = -1;

  constructor(
    private readonly bridge: BridgeClient,
    private readonly operators: OperatorStore,
  ) {}

  async workspaces(): Promise<Workspace[]> {
    return toWorkspaces(await this.bridge.call('agent', { op: 'desktop_workspaces', desktop: {} }));
  }

  async routines(workspace: Workspace): Promise<Routine[]> {
    return toRoutines(await this.runtime(workspace, { op: 'list' }));
  }

  async liveStatus(workspace: Workspace): Promise<LiveStatus> {
    const payload = await this.agent(workspace, { op: 'status', limit: STATUS_PAGE, offset: 0, includeIdle: false });
    return { runs: toActiveRuns(payload), blocked: toBlockedThreads(payload) };
  }

  async recentRuns(workspace: Workspace, limit: number): Promise<RunSummary[]> {
    return toRecentRuns(await this.bridge.call('agent', { op: 'desktop_runs', desktop: { workspaceId: workspace.id, limit } }));
  }

  async runDetail(workspace: Workspace, runId: string): Promise<RunDetail> {
    const [detail, recent] = await Promise.all([
      this.bridge.call('agent', { op: 'desktop_runs', desktop: { workspaceId: workspace.id, runId } }),
      this.recentRuns(workspace, 100),
    ]);
    return toRunDetail(detail, runId, recent.find((r) => r.runId === runId));
  }

  async recordBooks(workspace: Workspace): Promise<RecordBook[]> {
    return toRecordBooks(await this.agent(workspace, { op: 'ledger_list', sharePayload: '{}' }));
  }

  async findRecords(workspace: Workspace, query: RecordQuery): Promise<RecordResult> {
    const filter = query.status ? { status: query.status } : undefined;
    const [found, summary] = await Promise.all([
      this.agent(workspace, { op: 'ledger_find', sharePayload: JSON.stringify({ ledger: query.book, limit: query.limit, ...(filter ? { filter } : {}) }) }),
      this.agent(workspace, { op: 'ledger_summary', sharePayload: JSON.stringify({ ledger: query.book }) }),
    ]);
    return { ...toRecords(found), byStatus: toByStatus(summary) };
  }

  async start(workspace: Workspace, routineId: string, inputs: Record<string, string>): Promise<StartReceipt> {
    const clientRequestId = randomUUID();
    const payload = await this.runtime(workspace, {
      op: 'dispatch',
      routineId,
      clientRequestId,
      ...(Object.keys(inputs).length > 0 ? { invocationInputs: inputs } : {}),
    });
    return toStartReceipt(payload, routineId, clientRequestId);
  }

  async control(workspace: Workspace, runId: string, action: RunControlAction): Promise<string> {
    const payload = await this.runtime(workspace, { op: action, runId, clientRequestId: randomUUID() });
    // "accepted" only means Toone took the request; wait briefly for it to be applied, so a failure is not reported as success.
    let control = toControlState(payload);
    for (let waited = 0; control.operationId && PENDING_CONTROL.has(control.state) && waited < CONTROL_SETTLE_MS; waited += CONTROL_POLL_MS) {
      await new Promise((resolve) => setTimeout(resolve, CONTROL_POLL_MS));
      control = findControlState(await this.agent(workspace, { op: 'status', limit: STATUS_PAGE, offset: 0, includeIdle: false }), control.operationId) ?? control;
    }
    if (control.state === 'failed') throw new ConnectorError('APP_ERROR', `Toone could not ${action} the run: ${control.error ?? 'no reason given'}`);
    if (control.state === 'completed') return DONE[action];
    if (control.state === 'superseded') return `Replaced by a later pause, continue or cancel before it applied.`;
    return `Accepted. Toone is still applying the ${action}; check toone_overview in a moment.`;
  }

  async supplyInputs(workspace: Workspace, executionId: string, inputs: Record<string, string>): Promise<string> {
    const payload = await this.runtime(workspace, { op: 'supply_inputs', executionId, invocationInputs: inputs, clientRequestId: randomUUID() });
    return toControlMessage(payload, 'inputs accepted');
  }

  close(): Promise<void> {
    return this.bridge.close();
  }

  private async agent(workspace: Workspace, params: Record<string, unknown>): Promise<unknown> {
    return this.bridge.call('agent', params, await this.identity(workspace));
  }

  private async runtime(workspace: Workspace, params: Record<string, unknown>): Promise<unknown> {
    return this.bridge.call('routine_runtime', params, await this.identity(workspace));
  }

  /** Toone only answers routine calls from a known conversation; this opens (or reuses) the connector's. */
  private async identity(workspace: Workspace): Promise<BridgeIdentity> {
    // A new connection (Toone restarted, or the connector just paired) must open its conversation again.
    const generation = await this.bridge.connectionGeneration();
    if (generation !== this.generation) {
      this.identities.clear();
      this.generation = generation;
    }
    const known = this.identities.get(workspace.id);
    if (known) return known;
    const payload = (await this.bridge.call('agent', {
      op: 'desktop_context',
      desktop: { workspaceId: workspace.id, clientRequestId: this.operators.idFor(workspace.id), label: LABEL },
    })) as { threadId?: string; agentId?: string };
    const identity = { threadId: payload.threadId ?? '', agentId: payload.agentId ?? '' };
    this.identities.set(workspace.id, identity);
    return identity;
  }
}
