import { parsePlacementPreference, type PlacementPreference } from '../remnants/planGroupedPieces';

export type ProjectCutSettings = {
  preference: PlacementPreference;
  orders: Record<string, number>;
};

export const projectSubgroupKey = (group: string, subgroup: string) => JSON.stringify([group.trim(), subgroup.trim()]);

export function projectCutSettings(
  groups: readonly { name: string; subgroups?: readonly { name: string; cutGroupOrder?: number }[] }[],
  preference: PlacementPreference,
): ProjectCutSettings {
  return {
    preference,
    orders: Object.fromEntries(groups.flatMap(group => (group.subgroups ?? []).map(subgroup =>
      [projectSubgroupKey(group.name, subgroup.name), subgroup.cutGroupOrder ?? 1]))),
  };
}

export function parseProjectCutSettings(value: unknown): ProjectCutSettings | undefined {
  if (!value || typeof value !== 'object' || !('orders' in value) || !value.orders ||
    typeof value.orders !== 'object' || Array.isArray(value.orders) || !('preference' in value)) return undefined;
  const orders = Object.fromEntries(Object.entries(value.orders).filter(([, order]) => Number.isSafeInteger(order) && order > 0));
  return { preference: parsePlacementPreference(value.preference), orders };
}
