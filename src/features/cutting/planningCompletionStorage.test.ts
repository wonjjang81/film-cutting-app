import { describe, expect, it } from 'vitest';
import { parsePlanningCompletionState, serializePlanningCompletionState } from './planningCompletionStorage';

describe('planning completion storage', () => {
  it('restores merged and independent completion marks after a page reload', () => {
    const raw = serializePlanningCompletionState('project-1', {
      merged: { 'major-1': [3, 1, 3] },
      pieces: { 'subgroup-a': [2] },
    });

    expect(parsePlanningCompletionState(raw, 'project-1')).toEqual({
      merged: { 'major-1': [1, 3] },
      pieces: { 'subgroup-a': [2] },
      pendingServerSync: false,
    });
  });

  it('does not leak completion marks into another project', () => {
    const raw = serializePlanningCompletionState('project-1', { merged: { a: [1] }, pieces: {} });
    expect(parsePlanningCompletionState(raw, 'project-2')).toEqual({ merged: {}, pieces: {}, pendingServerSync: false });
  });

  it('rejects malformed placement IDs', () => {
    expect(parsePlanningCompletionState(JSON.stringify({ scope: 'project-1', merged: { a: [1, -2, 1.5, '3'] }, pieces: null }), 'project-1'))
      .toEqual({ merged: { a: [1] }, pieces: {}, pendingServerSync: false });
  });

  it('remembers that a local backup still needs a server flush', () => {
    const raw = serializePlanningCompletionState('project-1', { merged: { a: [1] }, pieces: {} }, true);
    expect(parsePlanningCompletionState(raw, 'project-1').pendingServerSync).toBe(true);
  });
});
