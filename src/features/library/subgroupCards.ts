export type SubgroupCard = { id: string; name: string; pieceIds: string[]; expanded: boolean };
export type SubgroupCardGroup = { id: string; displayId: string; subgroups: SubgroupCard[] };
export type IndependentSubgroupCard = { groupId: string; groupDisplayId: string; subgroup: SubgroupCard };

export function flattenSubgroupCards(groups: readonly SubgroupCardGroup[]): IndependentSubgroupCard[] {
  return groups.flatMap((group) => group.subgroups.map((subgroup) => ({
    groupId: group.id,
    groupDisplayId: group.displayId,
    subgroup,
  })));
}

export function hasAssignedSubgroups(groups: readonly SubgroupCardGroup[], groupId: string): boolean {
  return groups.some((group) => group.id === groupId && group.subgroups.length > 0);
}
