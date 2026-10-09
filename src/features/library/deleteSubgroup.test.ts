import { describe, expect, it } from 'vitest';
import { deleteSubgroupDraft } from './deleteSubgroup';

describe('subgroup deletion', () => {
  const group = { id: 'g1', pieces: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }], subgroups: [{ id: 'a', pieceIds: ['p1', 'p2'] }, { id: 'b', pieceIds: ['p3'] }] };
  it('removes only the selected subgroup and all of its pieces without mutating input', () => {
    const next = deleteSubgroupDraft(group, 'a');
    expect(next.pieces).toEqual([{ id: 'p3' }]);
    expect(next.subgroups).toEqual([group.subgroups[1]]);
    expect(group.pieces).toHaveLength(3);
  });
  it('allows removal of an empty subgroup and the last subgroup', () => {
    expect(deleteSubgroupDraft({ pieces: [], subgroups: [{ id: 'empty', pieceIds: [] }] }, 'empty')).toEqual({ pieces: [], subgroups: [] });
    const next = deleteSubgroupDraft(deleteSubgroupDraft(group, 'a'), 'b');
    expect(next.pieces).toEqual([]);
    expect(next.subgroups).toEqual([]);
    expect(deleteSubgroupDraft(group, 'missing')).toBe(group);
  });
});
