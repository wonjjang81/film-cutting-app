/** Remove only this subgroup and its pieces. Never create replacement pieces. */
export function deleteSubgroupDraft<T extends { pieces: { id: string }[]; subgroups: { id: string; pieceIds: string[] }[] }>(group: T, subgroupId: string): T {
  const subgroup = group.subgroups.find(s => s.id === subgroupId);
  if (!subgroup) return group;
  const removed = new Set(subgroup.pieceIds);
  return { ...group, pieces: group.pieces.filter(p => !removed.has(p.id)), subgroups: group.subgroups.filter(s => s.id !== subgroupId) };
}
