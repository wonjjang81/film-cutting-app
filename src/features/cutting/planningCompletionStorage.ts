export const PLANNING_COMPLETION_STORAGE_KEY = 'film-cutting-planning-completion-v1';

export type PlanningCompletionState = {
  merged: Record<string, number[]>;
  pieces: Record<string, number[]>;
  pendingServerSync: boolean;
};

type PlanningCompletionData = Omit<PlanningCompletionState, 'pendingServerSync'>;

const emptyState = (): PlanningCompletionState => ({ merged: {}, pieces: {}, pendingServerSync: false });

function normalizeCollection(value: unknown): Record<string, number[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, ids]) => {
    if (!Array.isArray(ids)) return [];
    const normalized = [...new Set(ids.filter((id): id is number => Number.isInteger(id) && id > 0))].sort((left, right) => left - right);
    return [[key, normalized]];
  }));
}

export function serializePlanningCompletionState(scope: string, state: PlanningCompletionData, pendingServerSync = false): string {
  return JSON.stringify({ scope, merged: normalizeCollection(state.merged), pieces: normalizeCollection(state.pieces), pendingServerSync });
}

export function parsePlanningCompletionState(raw: string | null, scope: string): PlanningCompletionState {
  if (!raw) return emptyState();
  try {
    const value = JSON.parse(raw) as { scope?: unknown; merged?: unknown; pieces?: unknown; pendingServerSync?: unknown };
    if (value.scope !== scope) return emptyState();
    return { merged: normalizeCollection(value.merged), pieces: normalizeCollection(value.pieces), pendingServerSync: value.pendingServerSync === true };
  } catch {
    return emptyState();
  }
}
