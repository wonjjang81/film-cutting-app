export const CURRENT_PROJECT_CONTEXT_STORAGE_KEY = 'film-cutting-current-project-context-v1';

export type CurrentProjectContext = { id: string; name: string };

export function serializeCurrentProjectContext(context: CurrentProjectContext): string {
  return JSON.stringify({ id: context.id.trim(), name: context.name.trim() });
}

export function parseCurrentProjectContext(raw: string | null): CurrentProjectContext | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CurrentProjectContext>;
    if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
    const id = value.id.trim();
    const name = value.name.trim();
    return id && name ? { id, name } : null;
  } catch { return null; }
}
