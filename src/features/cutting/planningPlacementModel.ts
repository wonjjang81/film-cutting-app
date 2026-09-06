export type PlacementSource = { id: number; sourceId: string };

export type MergedPlanSource = { mergeGroupId: string; sourceIds: readonly string[] };
export type SavedMergedJobSource = { mergeGroupId: string; sourceIds?: readonly string[]; updatedAt: string };
export type SavedPieceJobSource = { name: string; updatedAt: string };

export type PlacementSubgroup<T extends PlacementSource> = {
  id: string;
  title: string;
  items: T[];
};

/** Groups placement rows by the subgroup assigned to their source piece. */
export function groupPlacementsBySubgroup<T extends PlacementSource>(
  placements: readonly T[],
  subgroupNamesBySourceId: Readonly<Record<string, string>>,
  fallback = '미분류',
): PlacementSubgroup<T>[] {
  const grouped = new Map<string, PlacementSubgroup<T>>();
  placements.forEach((placement) => {
    const title = subgroupNamesBySourceId[placement.sourceId]?.trim() || fallback;
    const current = grouped.get(title);
    if (current) current.items.push(placement);
    else grouped.set(title, { id: title, title, items: [placement] });
  });
  return [...grouped.values()];
}

/** Toggles one placement and derives whether every current placement is complete. */
export function nextPlacementCompletion(
  completedIds: readonly number[],
  placementId: number,
  placementIds: readonly number[],
): { completedIds: number[]; complete: boolean } {
  const available = new Set(placementIds);
  const next = new Set(completedIds.filter((id) => available.has(id)));
  if (next.has(placementId)) next.delete(placementId);
  else if (available.has(placementId)) next.add(placementId);
  const normalized = [...next].sort((left, right) => left - right);
  return { completedIds: normalized, complete: available.size > 0 && normalized.length === available.size };
}

/** Resolves the newest persisted completion state for the current merged plan. */
export function findLatestMergedJob<T extends SavedMergedJobSource>(plan: MergedPlanSource, jobs: readonly T[]): T | undefined {
  const expected = new Set(plan.sourceIds);
  return jobs
    .filter((job) => job.mergeGroupId === plan.mergeGroupId && job.sourceIds !== undefined && job.sourceIds.length === expected.size && job.sourceIds.every((sourceId) => expected.has(sourceId)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

/** Resolves the newest persisted job for an independently planned piece. */
export function findLatestPieceJob<T extends SavedPieceJobSource>(groupName: string, pieceId: string, jobs: readonly T[], displayName?: string): T | undefined {
  const expectedNames = new Set([`${groupName} · ${pieceId} 작업`, ...(displayName?.trim() ? [`${groupName} · ${displayName.trim()} 작업`] : [])]);
  return jobs.filter((job) => expectedNames.has(job.name)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}
