import { groupPlacementsBySubgroup, type PlacementSource } from './planningPlacementModel';

/** Use the same location/major-group grouping as the placement list. No geometry is changed. */
export function subgroupHighlightOptions(placements: readonly PlacementSource[], subgroups: Record<string, string> = {}, majorGroups: Record<string, string> = {}) {
  return groupPlacementsBySubgroup(placements, subgroups, '미분류', majorGroups).map(group => ({
    id: group.id, title: group.title, count: group.items.length,
    placementIds: new Set(group.items.map(item => item.id)), sourceId: group.items[0]!.sourceId,
  }));
}

export function subgroupHighlightStyle(selected: boolean | null): { opacity: number; fillAlpha: string; strokeWidth: number } {
  return selected === null ? { opacity: 1, fillAlpha: '22', strokeWidth: 2 }
    : selected ? { opacity: 1, fillAlpha: '55', strokeWidth: 4 }
    : { opacity: 0.12, fillAlpha: '22', strokeWidth: 2 };
}
