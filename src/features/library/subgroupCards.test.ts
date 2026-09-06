import { describe, expect, it } from 'vitest';

import { flattenSubgroupCards, hasAssignedSubgroups, type SubgroupCardGroup } from './subgroupCards';

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
});
