export type GroupIdentity = { brand: string; productNumber: string };
export type GroupWithIdentity<TPiece extends { form: GroupIdentity }> = {
  id: string;
  mergeGroupId?: string;
  form: GroupIdentity;
  pieces: TPiece[];
};

/**
 * Applies a big-group identity change to the selected group and its pieces.
 * Groups in the same merge bucket can share brand/product number when the
 * caller explicitly requests merge synchronization; disabled merges stay
 * independent so each row can be edited on its own.
 */
export function updateGroupIdentity<TPiece extends { form: GroupIdentity }, TGroup extends GroupWithIdentity<TPiece>>(
  groups: readonly TGroup[],
  groupId: string,
  patch: Partial<GroupIdentity>,
  disabledMergeGroupId = '__disabled__',
  syncMergeGroup = true,
): TGroup[] {
  const target = groups.find((group) => group.id === groupId);
  if (!target) return [...groups];
  const sharesMergeIdentity = (group: TGroup) => syncMergeGroup
    && target.mergeGroupId !== undefined
    && target.mergeGroupId !== disabledMergeGroupId
    && group.mergeGroupId === target.mergeGroupId;
  return groups.map((group) => {
    if (group.id !== groupId && !sharesMergeIdentity(group)) return group;
    return {
      ...group,
      form: { ...group.form, ...patch },
      pieces: group.pieces.map((piece) => ({ ...piece, form: { ...piece.form, ...patch } })),
    };
  });
}
