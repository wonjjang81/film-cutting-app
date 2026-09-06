import { describe, expect, it } from 'vitest';

import { createEmptyProject, createProjectFromCurrentEstimate } from './projectCreation';

describe('createEmptyProject', () => {
  it('creates a named project that can be filled from the cutting tab', () => {
    const project = createEmptyProject('현장 A', '2026-09-05T12:00:00.000Z', []);

    expect(project).toEqual({
      id: 'project-1788609600000',
      name: '현장 A',
      jobIds: [],
      mergedJobIds: [],
      materialCostPerM: 10_000,
      constructionCostPerM2: 15_000,
      createdAt: '2026-09-05T12:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
    });
  });

  it('adds a suffix when the timestamp-based id already exists', () => {
    const project = createEmptyProject('현장 B', '2026-09-05T12:00:00.000Z', ['project-1788609600000']);

    expect(project.id).toBe('project-1788609600000-2');
  });

  it('creates a project bundle from the current estimate snapshot', () => {
    const result = createProjectFromCurrentEstimate('현장 작업', {
      pieces: [{ id: 'g1', name: '그룹 1', pieces: [{ id: 'p1', name: 'A_01', form: { brand: '영림', productNumber: '', rollWidth: '1220', pieceWidth: '100', pieceLength: '200', quantity: '1', gap: '0', sideMargin: '5', startEndMargin: '5', allowRotation: true } }] }],
    }, '2026-01-01T00:00:00.000Z', []);
    expect(result.project.name).toBe('현장 작업');
    expect(result.project.jobIds).toHaveLength(1);
    expect(result.jobs).toHaveLength(1);
  });
});
