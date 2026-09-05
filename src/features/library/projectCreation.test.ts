import { describe, expect, it } from 'vitest';

import { createEmptyProject } from './projectCreation';

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
});
