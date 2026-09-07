import { describe, expect, it } from 'vitest';

import { PIECE_INPUT_UNIT_HINT, commitSubgroupName, compactFieldAffixes, compactFieldLayout, flattenSubgroupCards, hasAssignedSubgroups, multiplyPieceQuantityBySiteCount, normalizeSubgroupNameDraft, normalizeSubgroupSiteCount, renameSubgroupPieceDrafts, renameSubgroupPieces, subgroupCardStackIndex, subgroupGroupSelectLabel, subgroupPieceDisplayName, subgroupPieceNamePart, toggleAllSubgroupCards, type SubgroupCardGroup } from './subgroupCards';

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

  it('removes a stale default subgroup letter after a subgroup was renamed', () => {
    expect(subgroupPieceNamePart('그룹 1', '안방문', '그룹 1_안방문_B_01')).toBe('01');
    expect(subgroupPieceDisplayName('그룹 1', '안방문', '그룹 1_안방문_B_01')).toBe('안방문_01');
    expect(subgroupPieceDisplayName('그룹 1', '안방화장실문', '그룹 1_안방화장실문_C-04')).toBe('안방화장실문_04');
    expect(renameSubgroupPieceDrafts('그룹 1', '안방문', '침실문', [{ id: '그룹 1_안방문_B_01', name: '그룹 1_안방문_B_01' }])).toEqual([
      { id: '그룹 1_침실문_01', name: '그룹 1_침실문_01' },
    ]);
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

  it('shows only the numeric big-group ID in a subgroup selector', () => {
    expect(subgroupGroupSelectLabel('1')).toBe('1');
    expect(subgroupGroupSelectLabel('')).toBe('—');
  });

  it('places the site-count unit after the compact stepper', () => {
    expect(compactFieldAffixes('개소', '개소')).toEqual({ label: '', unit: '개소' });
    expect(compactFieldAffixes('재단 폭', 'mm')).toEqual({ label: '폭', unit: '' });
    expect(compactFieldAffixes('필요 수량', '개')).toEqual({ label: '수량', unit: '' });
  });

  it('keeps the site-count stepper fixed to a two-digit input width', () => {
    expect(compactFieldLayout('개소')).toEqual({
      field: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: 82 },
      inputWrap: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: 60 },
      input: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: 24 },
    });
    expect(compactFieldLayout('재단 폭')).toBeNull();
  });

  it('toggles every subgroup card between expanded and collapsed states', () => {
    expect(toggleAllSubgroupCards(['a', 'b'], {})).toEqual({ a: true, b: true });
    expect(toggleAllSubgroupCards(['a', 'b'], { a: true, b: true })).toEqual({ a: false, b: false });
    expect(toggleAllSubgroupCards([], { stale: true })).toEqual({});
  });

  it('normalizes subgroup site count with a backward-compatible default', () => {
    expect(normalizeSubgroupSiteCount(undefined)).toBe(1);
    expect(normalizeSubgroupSiteCount('3')).toBe(3);
    expect(normalizeSubgroupSiteCount(0)).toBe(1);
    expect(normalizeSubgroupSiteCount('invalid')).toBe(1);
    expect(multiplyPieceQuantityBySiteCount(2, 3)).toBe(6);
  });
});
