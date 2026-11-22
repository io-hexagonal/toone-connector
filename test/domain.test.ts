import { describe, expect, it } from 'vitest';
import { ConnectorError } from '../src/domain/errors.js';
import { recordMatches, slimFields } from '../src/domain/records.js';
import { resolveRoutine, type Routine } from '../src/domain/routine.js';
import type { ActiveRun } from '../src/domain/run.js';
import { ago, clip } from '../src/domain/text.js';
import { collectWaiting } from '../src/domain/waiting.js';
import { pickWorkspace, type Workspace } from '../src/domain/workspace.js';

const routine = (id: string, name: string): Routine => ({ id, name, department: 'd', owner: 'o', parentId: null, needsRepair: false });
const run = (over: Partial<ActiveRun>): ActiveRun => ({
  runId: 'r1', routineId: 'a/b', routineName: 'B', status: 'running', startedAt: null, endedAt: null, lastStep: null,
  canPause: true, canContinue: false, canCancel: true, awaiting: [], heldSteps: [], ...over,
});
const ws = (name: string, path: string, selected = false): Workspace => ({ id: name, name, projectPath: path, loaded: true, selectedInApp: selected });

describe('text', () => {
  it('clips to one line and marks the cut', () => {
    expect(clip('a\n b', 10)).toBe('a b');
    expect(clip('abcdefghij', 5)).toBe('abcd…');
  });
  it('describes age', () => {
    const now = new Date('2026-11-22T12:00:00Z');
    expect(ago('2026-11-22T11:48:00Z', now)).toBe('12 min ago');
    expect(ago('2026-11-22T07:00:00Z', now)).toBe('5 h ago');
    expect(ago(null, now)).toBeNull();
  });
});

describe('resolveRoutine', () => {
  const all = [routine('authority/reddit-radar', 'Reddit Radar'), routine('authority/reddit-outreach', 'Reddit Outreach')];
  it('finds by words or exact id', () => {
    expect(resolveRoutine(all, 'radar').id).toBe('authority/reddit-radar');
    expect(resolveRoutine(all, 'authority/reddit-outreach').name).toBe('Reddit Outreach');
  });
  it('refuses a vague or unknown name', () => {
    expect(() => resolveRoutine(all, 'reddit')).toThrowError(ConnectorError);
    expect(() => resolveRoutine(all, 'nothing')).toThrowError(/No routine matches/);
  });
});

describe('pickWorkspace', () => {
  const all = [ws('growth', '/p/growth'), ws('other', '/p/other', true)];
  it('prefers the named one, then the current folder, then the one open in the app', () => {
    expect(pickWorkspace(all, 'growth', '/elsewhere').name).toBe('growth');
    expect(pickWorkspace(all, undefined, '/p/growth/sub').name).toBe('growth');
    expect(pickWorkspace(all, undefined, '/elsewhere').name).toBe('other');
  });
  it('does not match a sibling folder with the same prefix', () => {
    expect(pickWorkspace(all, undefined, '/p/growth-2').name).toBe('other');
  });
});

describe('collectWaiting', () => {
  it('lists missing inputs, failed steps, questions and paused runs once each', () => {
    const items = collectWaiting(
      [
        run({ runId: 'r1', awaiting: [{ executionId: 'e1', stepTitle: 'Pick', missingInputIds: ['topic'] }] }),
        run({ runId: 'r2', heldSteps: ['Send'] }),
        run({ runId: 'r3', status: 'paused', lastStep: 'Paused' }),
      ],
      [{ title: 'Q', routineId: null, runId: 'r1', activity: 'x' }, { title: 'Free question', routineId: null, runId: null, activity: 'Which one?' }],
    );
    expect(items.map((i) => i.kind)).toEqual(['needs_input', 'failed_step', 'question', 'paused']);
    expect(items[0]?.howToAnswer).toContain('e1');
  });
});

describe('records', () => {
  it('keeps records small', () => {
    const slim = slimFields(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i}`, 'x'.repeat(500)])));
    expect(Object.keys(slim)).toHaveLength(8);
    expect(slim.f0?.length).toBe(120);
  });
  it('matches every search word', () => {
    const record = { key: 'acme', status: null, updatedAt: null, fields: { name: 'Jane Doe' } };
    expect(recordMatches(record, 'jane acme')).toBe(true);
    expect(recordMatches(record, 'jane bob')).toBe(false);
  });
});
