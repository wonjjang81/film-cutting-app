import { composePieceId } from '../library/pieceIds';
import { subgroupPieceNamePart } from '../library/subgroupCards';
import type { DiagramSelection } from './diagramState';

export function diagramSubgroupName(part: string): string {
  return part.replace(/^싱크대\s+/, '').replace(/\s*\(내부\)$/, '').trim();
}

/** One diagram target creates one editable piece, regardless of door count. */
export function nextDiagramSubgroupName(part: string, names: readonly string[]): string {
  const base = diagramSubgroupName(part);
  if (!names.includes(base)) return base;
  let index = 2;
  while (names.includes(`${base}${index}`)) index++;
  return `${base}${index}`;
}

export function diagramInputTarget(groupName: string, selection: DiagramSelection, subgroups: readonly { id: string; name: string; installationPart?: string; pieceIds: string[] }[], preferredSubgroupId?: string) {
  const base = diagramSubgroupName(selection.part);
  const subgroup = subgroups.find(s => s.id === preferredSubgroupId && s.installationPart === selection.part)
    ?? subgroups.find(s => s.name === base && (!s.installationPart || s.installationPart === selection.part));
  const name = subgroup?.name ?? base;
  const suffix = `${selection.id}_01`;
  const existingPieceId = subgroup?.pieceIds.find(id => subgroupPieceNamePart(groupName, subgroup.name, id) === suffix);
  return { name, subgroupId: subgroup?.id, existingPieceId, pieceId: composePieceId(groupName, `${name}_${suffix}`) };
}
