export type PlacementSource = { id: number; sourceId: string };

export type MergedPlanSource = { mergeGroupId: string; sourceIds: readonly string[] };
export type SavedMergedJobSource = { mergeGroupId: string; sourceIds?: readonly string[]; updatedAt: string };
export type SavedPieceJobSource = { name: string; updatedAt: string };

export type PlacementSubgroup<T extends PlacementSource> = {
  id: string;
  title: string;
  items: T[];
};

export type PlacementCompletionControl = {
  checked: boolean;
  disabled: boolean;
  label: '재단 완료' | '완료 해제';
};

export type LayoutUtilizationComparison = { automatic: number; current: number; delta: number };

/** Keeps the automatic result as a stable baseline and measures live manual-layout changes. */
export function layoutUtilizationComparison(automaticPercent: number, currentPercent: number): LayoutUtilizationComparison {
  const automatic = Math.round(automaticPercent * 10) / 10;
  const current = Math.round(currentPercent * 10) / 10;
  return { automatic, current, delta: Math.round((current - automatic) * 10) / 10 };
}

/** Keeps the current merged-roll tab when possible and otherwise selects the first available tab. */
export function resolveActiveMergedPlanKey(keys: readonly string[], currentKey: string | null): string | null {
  return currentKey && keys.includes(currentKey) ? currentKey : (keys[0] ?? null);
}

/** Formats the calculation group name for the major-group roll tab. */
export function majorGroupTabLabel(groupNames: readonly string[], index: number): string {
  const names = groupNames.map((name) => name.trim().replace(/^그룹\s*/, '대그룹 ')).filter(Boolean);
  return names.length > 0 ? names.join(' + ') : `대그룹 ${index + 1}`;
}

/** Builds the completion action shared by placement lists and detail popups. */
export function placementCompletionControl(completed: boolean, busy: boolean, available: boolean): PlacementCompletionControl {
  return {
    checked: completed,
    disabled: busy || !available,
    label: completed ? '완료 해제' : '재단 완료',
  };
}

/** Returns whether every currently rendered placement list is collapsed. */
export function areAllPlacementListsCollapsed(ids: readonly string[], collapsed: Readonly<Record<string, boolean>>): boolean {
  return ids.length > 0 && ids.every((id) => collapsed[id] === true);
}

/** Toggles all currently rendered placement lists while ignoring stale keys. */
export function toggleAllPlacementLists(ids: readonly string[], collapsed: Readonly<Record<string, boolean>>): Record<string, boolean> {
  const allCollapsed = areAllPlacementListsCollapsed(ids, collapsed);
  return Object.fromEntries(ids.map((id) => [id, !allCollapsed]));
}

/** Groups placement rows by the subgroup assigned to their source piece. */
export function groupPlacementsBySubgroup<T extends PlacementSource>(
  placements: readonly T[],
  subgroupNamesBySourceId: Readonly<Record<string, string>>,
  fallback = '미분류',
  majorGroupNamesBySourceId?: Readonly<Record<string, string>>,
): PlacementSubgroup<T>[] {
  const grouped = new Map<string, PlacementSubgroup<T>>();
  placements.forEach((placement) => {
    const subgroup = subgroupNamesBySourceId[placement.sourceId]?.trim() || fallback;
    const majorGroup = majorGroupNamesBySourceId?.[placement.sourceId]?.trim();
    const title = majorGroup ? `${majorGroup} · ${subgroup}` : subgroup;
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

/** Prefers the current local state, which may contain changes not flushed to the server yet. */
export function resolvePlacementCompletionIds(persistedIds?: readonly number[], temporaryIds?: readonly number[]): number[] {
  return [...(temporaryIds ?? persistedIds ?? [])].sort((left, right) => left - right);
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
