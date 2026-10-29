import { describe, expect, it } from 'vitest';
import { inputDraftKey, inputDraftWrites, parseInputDraftBackup, parseActiveInputProject, type InputDraftBackup } from './inputDraftBackup';

const form = { brand: '영림', productNumber: 'keep', rollWidth: '1220', pieceWidth: '600', pieceLength: '1200', quantity: '2', gap: '0', sideMargin: '5', startEndMargin: '5', allowRotation: false, placementDeferred: true };
const draft: InputDraftBackup = {
  version: 1, ownerId: 'user1', updatedAt: '2026-10-29T00:00:00Z', projectId: 'project1', projectName: '입력 보존',
  groups: [{id:'g1', displayId:'1', name:'대그룹1', form, pieces:[{id:'p1',name:'상부장',form}], subgroups:[{id:'s1', name:'상부장',pieceIds:['p1'],expanded:true,difficulty:'medium',siteCount:'3',overallDimensions:{widthMm:'',heightMm:'',depthMm:'',doorCount:''}}],filmName:'필름',materialCostPerM:'10000',constructionCostPerM2:'',patternFixed:true}],
  activeGroupId:'g1',activePieceId:'p1',useRemnants:true,diagramPart:'싱크대 상부장',diagramTargets:{g1:'s1'},
};
describe('input draft preservation', () => {
  it('round trips partial numeric text, groups, quantity, defer and selection', () => {
    const partial = structuredClone(draft);
    partial.groups[0]!.pieces[0]!.form.pieceWidth = '';
    expect(parseInputDraftBackup(JSON.stringify(partial), 'user1', 'project1')).toEqual(partial);
  });
  it('isolates accounts, explicit projects and unsaved inputs', () => {
    expect(parseInputDraftBackup(JSON.stringify(draft), 'other')).toBeNull();
    expect(parseInputDraftBackup(JSON.stringify(draft), 'user1', 'other')).toBeNull();
    expect(inputDraftKey('a:b', null)).not.toBe(inputDraftKey('a', 'b'));
    expect(inputDraftKey('user1', null)).not.toBe(inputDraftKey('user1', 'unsaved'));
    expect(parseActiveInputProject('{"projectId":null}')).toBeNull();
    expect(parseActiveInputProject('bad')).toBeUndefined();
  });
  it('keeps only temporary input and a separate latest minute backup', () => {
    const key=inputDraftKey('user1','project1');
    expect(inputDraftWrites(draft,true)).toEqual([[key+':backup',JSON.stringify(draft)]]);
    expect(inputDraftWrites(draft)[0]).toEqual([key,JSON.stringify(draft)]);
  });
  it('rejects malformed backups without producing overwrite operations', () => {
    expect(parseInputDraftBackup('{','user1')).toBeNull();
    const invalid={...draft,groups:[{...draft.groups[0],pieces:[{id:'p1',form:{}}]}]} as InputDraftBackup;
    expect(parseInputDraftBackup(JSON.stringify(invalid),'user1')).toBeNull();
    expect(()=>inputDraftWrites(invalid)).toThrow();
  });
});
