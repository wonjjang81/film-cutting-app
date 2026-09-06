import { describe, expect, it } from 'vitest';

import { PIECE_INPUT_UNIT_HINT, commitSubgroupName, flattenSubgroupCards, hasAssignedSubgroups, normalizeSubgroupNameDraft, renameSubgroupPieceDrafts, renameSubgroupPieces, subgroupCardStackIndex, subgroupPieceDisplayName, subgroupPieceNamePart, type SubgroupCardGroup } from './subgroupCards';

describe('subgroup card normalization', () => {
  it('flattens subgroups into independent cards while preserving their big-group assignment', () => {
    const groups: SubgroupCardGroup[] = [
      { id: 'group-1', displayId: '1', subgroups: [{ id: 'g1-a', name: 'A', pieceIds: ['p1'], expanded: true }] },
      { id: 'group-2', displayId: '2', subgroups: [{ id: 'g2-b', name: 'B', pieceIds: ['p2'], expanded: false }] },
    ];

    expect(flattenSubgroupCards(groups)).toEqual([
      { groupId: 'group-1', groupDisplayId: '1', subgroup: groups[0]!.subgroups[0] },
      { groupId: 'group-2', groupDisplayId: '2', subgroup: groups[1]!.subgroups[0] },
    ]);
  });

  it('reports whether a big group still owns subgroups before deletion', () => {
    const groups: SubgroupCardGroup[] = [
      { id: 'group-1', displayId: '1', subgroups: [{ id: 'g1-a', name: 'A', pieceIds: [], expanded: true }] },
      { id: 'group-2', displayId: '2', subgroups: [] },
    ];

    expect(hasAssignedSubgroups(groups, 'group-1')).toBe(true);
    expect(hasAssignedSubgroups(groups, 'group-2')).toBe(false);
  });

  it('updates piece IDs when a subgroup name changes', () => {
    expect(renameSubgroupPieces('그룹 1', 'A', '창짝', ['그룹 1_A_01', '그룹 1_A_02'])).toEqual([
      '그룹 1_창짝_01',
      '그룹 1_창짝_02',
    ]);
  });

  it('updates draft piece IDs so a renamed subgroup does not retain the old prefix', () => {
    expect(renameSubgroupPieceDrafts('그룹 1', 'B', '드레스룸', [{ id: '그룹 1_B_01', name: '그룹 1_B_01' }])).toEqual([
      { id: '그룹 1_드레스룸_01', name: '그룹 1_드레스룸_01' },
    ]);
  });

  it('keeps the numeric suffix when the original subgroup used the default group-only ID', () => {
    expect(renameSubgroupPieceDrafts('그룹 1', 'A', '드레스룸', [{ id: '그룹 1_01', name: '그룹 1_01' }])).toEqual([
      { id: '그룹 1_드레스룸_01', name: '그룹 1_드레스룸_01' },
    ]);
  });

  it('renames legacy IDs that contain the generated group prefix', () => {
    expect(renameSubgroupPieceDrafts('그룹 1', 'A', '드레스룸', [{ id: 'group-1-그룹 1_01', name: 'group-1-그룹 1_01' }])).toEqual([
      { id: '그룹 1_드레스룸_01', name: '그룹 1_드레스룸_01' },
    ]);
  });

  it('puts earlier cards above later cards so dropdowns are not covered', () => {
    expect(subgroupCardStackIndex(4, 0)).toBe(4);
    expect(subgroupCardStackIndex(4, 3)).toBe(1);
  });

  it('shows the subgroup and canonical group-prefixed piece name together', () => {
    expect(subgroupPieceDisplayName('그룹 1', 'A', '그룹 1_01')).toBe('A_01');
    expect(subgroupPieceDisplayName('그룹 1', 'B', '그룹 1_B_01')).toBe('B_01');
    expect(subgroupPieceNamePart('그룹 1', 'B', '그룹 1_B_01')).toBe('01');
  });

  it('normalizes legacy IDs that include an extra group prefix', () => {
    expect(subgroupPieceNamePart('그룹 1', 'A', 'group-1-그룹 1_01')).toBe('01');
    expect(subgroupPieceDisplayName('그룹 1', 'A', 'group-1-그룹 1_01')).toBe('A_01');
  });

  it('allows an empty name while editing and restores the previous name on commit', () => {
    expect(normalizeSubgroupNameDraft('')).toBe('');
    expect(normalizeSubgroupNameDraft('  새  이름  ')).toBe(' 새 이름 ');
    expect(commitSubgroupName('', 'A')).toBe('A');
    expect(commitSubgroupName('  새  이름  ', 'A')).toBe('새 이름');
  });

  it('uses one unit hint for all compact piece fields', () => {
    expect(PIECE_INPUT_UNIT_HINT).toBe('단위: 폭·길이 mm · 수량 개');
  });
});
