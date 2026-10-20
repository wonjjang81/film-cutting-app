import { describe, expect, it } from 'vitest';

import { createEmptyProject, createProjectFromCurrentEstimate } from './projectCreation';
import { createProjectExport, serializeProjectExport, parseProjectExport } from './projectTransfer';
import { createLibraryRepository } from './libraryRepository';

describe('createEmptyProject', () => {
  it('round trips deferred inputs without allocating a roll or losing dimensions', async () => {
    const form = {brand:'영림',productNumber:'A',rollWidth:'1220',pieceWidth:'900',pieceLength:'2600',cutAllowance:'50',quantity:'2',gap:'0',sideMargin:'0',startEndMargin:'0',allowRotation:true,placementDeferred:true};
    const bundle=createProjectFromCurrentEstimate('보류 테스트',{pieces:[{id:'g',name:'그룹 1',pieces:[{id:'p',name:'p',form}]}]},'2026-10-20T00:00:00.000Z',[]);
    const saved=parseProjectExport(serializeProjectExport(createProjectExport(bundle.project,bundle.jobs,bundle.mergedJobs)));
    expect(saved.jobs[0]!.input.placementDeferred).toBe(true);
    expect(saved.jobs[0]!.input.sourcePieceWidthMm).toBe(900);
    expect(saved.jobs[0]!.input.quantity).toBe(2);
    expect(saved.jobs[0]!.result.producedQuantity).toBe(0);
    expect(saved.jobs[0]!.result.newRollLengthMm).toBe(0);
    expect(saved.mergedJobs).toHaveLength(0);
    let stored: string | null=null;
    const repository=createLibraryRepository({get:async()=>stored,set:async(_key,value)=>{stored=value;}});
    await repository.saveProjectBundle(saved.project,saved.jobs,saved.mergedJobs);
    const restored=await repository.load();
    expect(restored.document.jobs[0]!.input.placementDeferred).toBe(true);
  });
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
