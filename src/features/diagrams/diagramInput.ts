import { composePieceId } from '../library/pieceIds';
import { subgroupPieceNamePart } from '../library/subgroupCards';
import type { DiagramSelection } from './diagramState';

export function diagramSubgroupName(part: string): string {
  return part.replace(/^싱크대\s+/, '').replace(/\s*\(내부\)$/, '').trim();
}

/** One diagram target creates one editable piece, regardless of door count. */
export function diagramInputTarget(groupName: string, selection: DiagramSelection, subgroups: readonly { id: string; name: string; installationPart?: string; pieceIds: string[] }[]) {
  const name = diagramSubgroupName(selection.part);
  const subgroup = subgroups.find(s => s.name === name && (!s.installationPart || s.installationPart === selection.part));
  const suffix = `${selection.id}_01`;
  const existingPieceId = subgroup?.pieceIds.find(id => subgroupPieceNamePart(groupName, subgroup.name, id) === suffix);
  return { name, subgroupId: subgroup?.id, existingPieceId, pieceId: composePieceId(groupName, `${name}_${suffix}`) };
}
