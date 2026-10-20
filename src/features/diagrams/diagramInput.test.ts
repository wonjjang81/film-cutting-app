import { describe, expect, it } from 'vitest';
import { diagramInputTarget, diagramSubgroupName, nextDiagramSubgroupName } from './diagramInput';
import { subgroupPieceDisplayName } from '../library/subgroupCards';

const selection = { id: 'U-SL', shapeKey: 'cabinet:U-SL', part: '싱크대 상부장', name: '상부장 왼쪽 끝판' };
describe('diagram piece input', () => {
  it('can add ten independently targeted locations using the same cabinet ID', () => {
    const locations: {id:string;name:string;installationPart:string;pieceIds:string[]}[]=[];
    for(let i=1;i<=10;i++){
      const name=nextDiagramSubgroupName(selection.part,locations.map(s=>s.name));
      const location={id:String(i),name,installationPart:selection.part,pieceIds:[] as string[]};
      locations.push(location);
      const target=diagramInputTarget('그룹 1',selection,locations,location.id);
      expect(name).toBe(`상부장${i}`);
      expect(target.subgroupId).toBe(location.id);
      expect(target.existingPieceId).toBeUndefined();
      location.pieceIds.push(target.pieceId);
    }
    expect(new Set(locations.flatMap(s=>s.pieceIds)).size).toBe(10);
  });
  it('keeps different locations independent even when the diagram ID is identical', () => {
    const groups = [
      { id: 'one', name: '상부장', installationPart: selection.part, pieceIds: ['그룹 1_상부장_U-SL_01'] },
      { id: 'two', name: '상부장2', installationPart: selection.part, pieceIds: [] },
    ];
    const target = diagramInputTarget('그룹 1', selection, groups, 'two');
    expect(target.subgroupId).toBe('two');
    expect(target.existingPieceId).toBeUndefined();
    expect(target.pieceId).toBe('그룹 1_상부장2_U-SL_01');
    expect(nextDiagramSubgroupName(selection.part, ['상부장', '상부장2'])).toBe('상부장3');
    expect(nextDiagramSubgroupName(selection.part, [])).toBe('상부장1');
  });
  it('uses a short part name and one target-specific piece ID', () => {
    const target = diagramInputTarget('그룹 1', selection, []);
    expect(target.name).toBe('상부장');
    expect(target.subgroupId).toBeUndefined();
    expect(subgroupPieceDisplayName('그룹 1', target.name, target.pieceId)).toBe('상부장_U-SL_01');
    expect(diagramSubgroupName('싱크대 하부장')).toBe('하부장');
    expect(diagramSubgroupName('냉장고장')).toBe('냉장고장');
  });
  it('adds another target to the same part subgroup, but reopens an existing target', () => {
    const subgroup = { id: 'upper', name: '상부장', installationPart: selection.part, pieceIds: ['그룹 1_상부장_U-SL_01'] };
    expect(diagramInputTarget('그룹 1', selection, [subgroup]).existingPieceId).toBe(subgroup.pieceIds[0]);
    const next = diagramInputTarget('그룹 1', { ...selection, id: 'U01' }, [subgroup]);
    expect(next.subgroupId).toBe('upper');
    expect(next.existingPieceId).toBeUndefined();
    expect(next.pieceId).toBe('그룹 1_상부장_U01_01');
    expect(diagramInputTarget('그룹 1', { ...selection, id: 'L01', part: '싱크대 하부장' }, [subgroup]).subgroupId).toBeUndefined();
  });
});
