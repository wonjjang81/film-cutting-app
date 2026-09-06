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

export function renameSubgroupPieces(groupName: string, previousName: string, nextName: string, pieceIds: readonly string[]): string[] {
  const previousPrefix = `${groupName.trim()}_${previousName.trim()}_`;
  const normalizedName = nextName.trim();
  return pieceIds.map((pieceId) => {
    const suffix = pieceId.startsWith(previousPrefix)
      ? pieceId.slice(previousPrefix.length)
      : pieceNamePart(`${groupName.trim()}_${previousName.trim()}`, pieceId);
    return composePieceId(groupName, `${normalizedName}_${suffix || '01'}`);
  });
}

export function subgroupCardStackIndex(total: number, index: number): number {
  return Math.max(1, total - index);
}
import { composePieceId, pieceNamePart } from './pieceIds';
