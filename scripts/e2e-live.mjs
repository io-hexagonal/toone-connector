// Live end-to-end check of the three action tools against the running Toone app.
// It CONFIRMS actions, so it starts real runs. It only ever starts the one routine named on the
// command line, and that routine must match the argument exactly (id or name, no fuzzy search).
// Use a harmless test routine: one per-run input, then a few steps that only reply "OK".
//
//   node scripts/e2e-live.mjs "Connector E2E (safe to delete)" [--workspace NAME] [--server PATH] [--verbose]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const verbose = args.includes('--verbose');
if (verbose) args.splice(args.indexOf('--verbose'), 1);
const workspace = flag('--workspace');
const server = flag('--server') ?? 'plugin/server/toone-connector.mjs';
const wanted = args[0]?.trim();
if (!wanted) {
  console.error('Usage: node scripts/e2e-live.mjs "<routine id or exact name>" [--workspace NAME] [--server PATH] [--verbose]');
  console.error('Refusing to run: this script starts real runs, so it needs the exact routine to use.');
  process.exit(2);
}

const STEP_WAIT_MS = 4 * 60_000;
const SHORT_WAIT_MS = 90_000;
/** How long a step must have been running before the pause, to stay clear of step boundaries. */
const MID_STEP_MS = 5_000;
const WORD = 'banana';
let failed = 0;
const check = (name, ok, note = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`); if (!ok) failed += 1; return ok; };
const text = (r) => r.content?.[0]?.text ?? '';
const json = (r) => { try { return JSON.parse(text(r)); } catch { return null; } };
const debug = (label, value) => { if (verbose) console.log(`      ${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scope = workspace ? { workspace } : {};

// The person's side of the confirmation: say yes only when the question names what we expect.
let expectInPrompt = null;
const prompts = [];
const client = new Client({ name: 'e2e-live', version: '0' }, { capabilities: { elicitation: {} } });
client.setRequestHandler(ElicitRequestSchema, async (req) => {
  const message = String(req.params.message ?? '');
  prompts.push(message);
  const ok = expectInPrompt !== null && expectInPrompt.every((part) => message.includes(part));
  debug('asked', message.split('\n')[0]);
  return ok ? { action: 'accept', content: { confirm: true } } : { action: 'decline' };
});
await client.connect(new StdioClientTransport({ command: 'node', args: [server, 'mcp'], env: { ...process.env, TOONE_CONNECTOR_UNPROMPTED: '' } }));
const call = async (name, a) => {
  const r = await client.callTool({ name, arguments: { ...scope, ...a } });
  debug(name, text(r).slice(0, 1500));
  return r;
};
const act = async (name, a, expect) => {
  expectInPrompt = expect;
  try { return await call(name, a); } finally { expectInPrompt = null; }
};

/** Polls `read` until `test` passes or the time runs out; returns the last value that passed, else null. */
async function until(read, test, ms) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (test(value)) return value;
    if (Date.now() > end) return null;
    await sleep(2_000);
  }
}

const started = new Set();
const activeOf = async (routineId) => (json(await call('toone_overview', {}))?.running ?? []).filter((r) => r.routineId === routineId);

async function cleanUp(routineId) {
  if (!routineId) return;
  for (const run of await activeOf(routineId).catch(() => [])) {
    if (!started.has(run.runId)) continue;
    const r = await act('toone_control', { runId: run.runId, action: 'cancel' }, ['Cancel']).catch(() => null);
    console.log(`      cleanup: cancelled ${run.runId}${r?.isError ? ` (failed: ${text(r)})` : ''}`);
  }
}

let routine = null;
try {
  // 1. Resolve the routine exactly. Never fall back to a fuzzy match.
  const listed = json(await call('toone_routines', { search: wanted }))?.routines ?? [];
  const exact = listed.filter((r) => r.id === wanted || r.name === wanted);
  if (!check('the named routine exists exactly once', exact.length === 1, exact.map((r) => r.id).join(', ') || `no exact match for "${wanted}"`)) throw new Error('stop');
  routine = exact[0];
  const before = await activeOf(routine.id);
  if (!check('no run of it is already active', before.length === 0, before.map((r) => `${r.runId} ${r.status}`).join(', '))) {
    routine = null; // not ours to clean up
    throw new Error('stop');
  }

  // 2. Start without the per-run input, so the run waits for it.
  const startReply = await act('toone_start', { routine: routine.id }, [routine.name]);
  const receipt = json(startReply);
  check('start asks the person, naming the routine', prompts.at(-1)?.includes(routine.name) === true, prompts.at(-1)?.split('\n')[0]);
  if (!check('start is accepted after a yes', !startReply.isError && receipt?.routineId === routine.id, startReply.isError ? text(startReply) : `state ${receipt?.state}, awaiting ${receipt?.awaitingInputIds?.join(',') || 'nothing'}`)) throw new Error('stop');
  check('the receipt names the missing input', receipt.awaitingInputIds.length > 0, receipt.awaitingInputIds.join(','));

  const appeared = await until(() => activeOf(routine.id), (runs) => runs.length > 0, SHORT_WAIT_MS);
  const run1 = appeared?.[0];
  if (!check('the run appears in the overview', Boolean(run1), run1 ? `${run1.runId} ${run1.status}` : 'not seen')) throw new Error('stop');
  started.add(run1.runId);

  // 3. The waiting item, then the answer.
  const waitingFor = (items) => items.find((w) => w.runId === run1.runId && w.kind === 'needs_input');
  const waitingItems = await until(async () => json(await call('toone_waiting', {}))?.waiting ?? [], (items) => Boolean(waitingFor(items)), SHORT_WAIT_MS);
  const item = waitingItems && waitingFor(waitingItems);
  check('the waiting item appears', Boolean(item), item?.what ?? 'not seen');
  const executionId = item?.executionId ?? item?.howToAnswer?.match(/executionId (\S+)/)?.[1] ?? receipt.requestId;
  const inputId = receipt.awaitingInputIds[0] ?? 'input-word';
  const answer = await act('toone_answer', { executionId, inputs: { [inputId]: WORD } }, [routine.name, WORD]);
  check('answer asks the person, naming the routine', prompts.at(-1)?.includes(routine.name) === true, prompts.at(-1)?.split('\n')[0]);
  check('answer is accepted after a yes', !answer.isError, text(answer).slice(0, 160));
  const unblocked = await until(async () => json(await call('toone_waiting', {}))?.waiting ?? [], (items) => !waitingFor(items), SHORT_WAIT_MS);
  check('the waiting item clears', unblocked !== null);

  // 4. Pause while a step is well under way (not in the seconds around a step starting or ending), then continue.
  let seenStep = null;
  let seenSince = 0;
  const midStep = await until(() => activeOf(routine.id), (runs) => {
    const run = runs.find((r) => r.runId === run1.runId);
    const step = run?.canPause && /running/i.test(run.lastStep ?? '') ? run.lastStep : null;
    if (step !== seenStep) { seenStep = step; seenSince = Date.now(); }
    return step !== null && Date.now() - seenSince >= MID_STEP_MS;
  }, STEP_WAIT_MS);
  check('the run can be paused while a step is under way', midStep !== null, seenStep ?? 'no step seen running');
  const pause = await act('toone_control', { runId: run1.runId, action: 'pause' }, ['Pause', routine.name]);
  if (!check('pause is accepted after a yes', !pause.isError, text(pause).slice(0, 160))) throw new Error('stop');
  const paused = await until(() => activeOf(routine.id), (runs) => runs.some((r) => r.runId === run1.runId && r.status === 'paused'), STEP_WAIT_MS);
  check('the run shows as paused', paused !== null, paused?.find((r) => r.runId === run1.runId)?.lastStep ?? '');
  const pausedWaiting = json(await call('toone_waiting', {}))?.waiting ?? [];
  check('a paused run is listed as waiting', pausedWaiting.some((w) => w.runId === run1.runId && w.kind === 'paused'));
  const resume = await act('toone_control', { runId: run1.runId, action: 'continue' }, ['Continue', routine.name]);
  if (!check('continue is accepted after a yes', !resume.isError, text(resume).slice(0, 160))) throw new Error('stop');
  const resumed = await until(() => activeOf(routine.id), (runs) => !runs.some((r) => r.runId === run1.runId && r.status === 'paused'), SHORT_WAIT_MS);
  check('the run is no longer paused', resumed !== null, resumed?.find((r) => r.runId === run1.runId)?.status ?? 'finished');
  const finished = await until(() => activeOf(routine.id), (runs) => !runs.some((r) => r.runId === run1.runId), STEP_WAIT_MS);
  check('the run finishes after continuing', finished !== null);

  // 5. A second run, with the input given up front, cancelled while in progress.
  const start2 = await act('toone_start', { routine: routine.id, inputs: { [inputId]: WORD } }, [routine.name, WORD]);
  const receipt2 = json(start2);
  check('a second start with its input is accepted', !start2.isError && receipt2?.awaitingInputIds?.length === 0, start2.isError ? text(start2) : `state ${receipt2?.state}`);
  const appeared2 = await until(() => activeOf(routine.id), (runs) => runs.some((r) => r.runId !== run1.runId), SHORT_WAIT_MS);
  const run2 = appeared2?.find((r) => r.runId !== run1.runId);
  if (run2) started.add(run2.runId);
  if (check('the second run appears in the overview', Boolean(run2), run2 ? `${run2.runId} ${run2.status}` : 'not seen')) {
    const cancel = await act('toone_control', { runId: run2.runId, action: 'cancel' }, ['Cancel', routine.name]);
    check('cancel is accepted after a yes', !cancel.isError, text(cancel).slice(0, 160));
    const gone = await until(() => activeOf(routine.id), (runs) => !runs.some((r) => r.runId === run2.runId), SHORT_WAIT_MS);
    check('the cancelled run leaves the overview', gone !== null);
  }

  // 6. Final states, read back through toone_run.
  const detail1 = json(await call('toone_run', { runId: run1.runId }));
  const failedStep = (detail1?.steps ?? []).find((s) => s.state === 'failed');
  check('run 1 reads back as completed', /complete|succeed/i.test(detail1?.status ?? ''), `${detail1?.status}; steps: ${(detail1?.steps ?? []).map((s) => s.state).join(',')}${failedStep ? `; "${failedStep.title}": ${failedStep.summary}` : ''}`);
  check('run 1 lists every step', (detail1?.steps ?? []).length >= 5, `${detail1?.steps?.length ?? 0} steps`);
  if (run2) {
    const detail2 = json(await call('toone_run', { runId: run2.runId }));
    check('run 2 reads back as cancelled', /cancel/i.test(detail2?.status ?? ''), `${detail2?.status}; steps: ${(detail2?.steps ?? []).map((s) => s.state).join(',')}`);
  }
} catch (error) {
  if (error?.message !== 'stop') check('no unexpected error', false, error instanceof Error ? error.message : String(error));
} finally {
  await cleanUp(routine?.id);
  await client.close();
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
