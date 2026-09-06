import { describe, expect, it } from 'vitest';

import { createProjectExport, parseProjectExport, serializeProjectExport } from './projectTransfer';
import type { SavedCuttingJob, SavedProject } from './models';

const timestamp = '2026-09-06T00:00:00.000Z';
const project: SavedProject = {
  id: 'project-1',
  name: '현장 A',
  jobIds: ['job-1'],
  mergedJobIds: [],
  materialCostPerM: 10_000,
  constructionCostPerM2: 15_000,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const job: SavedCuttingJob = {
  id: 'job-1',
  name: 'A_01 작업',
  groupId: 'group-1',
  brand: '영림',
  productNumber: '',
  createdAt: timestamp,
  updatedAt: timestamp,
  input: { rollWidthMm: 1220, pieceWidthMm: 100, pieceLengthMm: 200, quantity: 1, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, allowRotation: true },
  remnantIds: [],
  remnantSummary: [],
  result: { newRollLengthMm: 210, producedQuantity: 1, overproduction: 0, utilizationPercent: 80, wastePercent: 20, optimizationStatus: 'exact' },
};

describe('projectTransfer', () => {
  it('serializes and parses a single project bundle without losing its jobs', () => {
    const exported = createProjectExport(project, [job], []);
    const parsed = parseProjectExport(serializeProjectExport(exported));

    expect(parsed).toEqual(exported);
  });

  it('rejects a library backup when a single project file is required', () => {
    expect(() => parseProjectExport(JSON.stringify({ version: 1, presets: [], jobs: [], remnants: [], mergedJobs: [], projects: [] }))).toThrow('프로젝트 파일 형식이 아닙니다');
  });
});
