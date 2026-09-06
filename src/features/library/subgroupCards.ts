import { composePieceId, pieceNamePart } from './pieceIds';
import type { ConstructionDifficulty } from '../estimate/difficultyPricing';

export type SubgroupCard = { id: string; name: string; pieceIds: string[]; expanded: boolean; difficulty?: ConstructionDifficulty };
export type SubgroupCardGroup = { id: string; displayId: string; subgroups: SubgroupCard[] };
export type IndependentSubgroupCard = { groupId: string; groupDisplayId: string; subgroup: SubgroupCard };
export const PIECE_INPUT_UNIT_HINT = '단위: 폭·길이 mm · 수량 개';

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

/** Keeps the controlled input editable while allowing a temporary empty value. */
export function normalizeSubgroupNameDraft(value: string): string {
  return value.replace(/\s+/g, ' ');
}

/** Commits a draft name, restoring the previous name when the draft is blank. */
export function commitSubgroupName(value: string, fallback: string): string {
  return normalizeSubgroupNameDraft(value).trim() || fallback.trim();
}

export function renameSubgroupPieces(groupName: string, previousName: string, nextName: string, pieceIds: readonly string[]): string[] {
  const normalizedGroup = groupName.trim();
  const previousPrefix = `${normalizedGroup}_${previousName.trim()}_`;
  const groupPrefix = `${normalizedGroup}_`;
  const normalizedName = nextName.trim();
  return pieceIds.map((pieceId) => {
    const suffix = pieceId.startsWith(previousPrefix)
      ? pieceId.slice(previousPrefix.length)
      : pieceId.startsWith(groupPrefix)
        ? pieceId.slice(groupPrefix.length)
        : subgroupPieceNamePart(normalizedGroup, previousName, pieceId);
    return composePieceId(groupName, `${normalizedName}_${suffix || '01'}`);
  });
}

/** Renames the persisted draft IDs and display names together after a subgroup rename. */
export function renameSubgroupPieceDrafts<T extends { id: string; name: string }>(groupName: string, previousName: string, nextName: string, pieces: readonly T[]): T[] {
  const nextIds = renameSubgroupPieces(groupName, previousName, nextName, pieces.map((piece) => piece.id));
  return pieces.map((piece, index) => ({ ...piece, id: nextIds[index]!, name: nextIds[index]! }));
}

export function subgroupCardStackIndex(total: number, index: number): number {
  return Math.max(1, total - index);
}

/**
 * Returns the editable piece suffix while hiding an optional subgroup prefix
 * that older drafts embedded in the persisted piece ID.
 */
export function subgroupPieceNamePart(groupName: string, subgroupName: string, pieceId: string): string {
  const subgroupPrefix = `${subgroupName.trim()}_`;
  const normalizedGroup = groupName.trim();
  const normalizedPieceId = pieceId.trim();
  const groupPrefixes = normalizedGroup ? [`${normalizedGroup}_`, `${normalizedGroup}-`] : [];
  const groupPrefix = groupPrefixes
    .map((prefix) => ({ prefix, index: normalizedPieceId.lastIndexOf(prefix) }))
    .filter(({ index }) => index >= 0)
    .sort((left, right) => right.index - left.index)[0];
  const suffix = groupPrefix
    ? normalizedPieceId.slice(groupPrefix.index + groupPrefix.prefix.length)
    : pieceNamePart(groupName, pieceId);
  return suffix.startsWith(subgroupPrefix) ? suffix.slice(subgroupPrefix.length) || '01' : suffix || '01';
}

/**
 * Keeps the subgroup visible without making the big-group name part of the
 * compact piece label. Legacy IDs such as `그룹 1_B_01` become `B_01`.
 */
export function subgroupPieceDisplayName(groupName: string, subgroupName: string, pieceId: string): string {
  const normalizedGroup = groupName.trim();
  const normalizedSubgroup = subgroupName.trim() || 'A';
  return `${normalizedSubgroup}_${subgroupPieceNamePart(normalizedGroup, normalizedSubgroup, pieceId)}`;
}
