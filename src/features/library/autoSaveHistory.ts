export const AUTO_SAVE_HISTORY_STORAGE_KEY = 'film-cutting-auto-save-history';

/** History persistence is opt-in so calculations remain drafts by default. */
export function parseAutoSaveHistory(value: string | null): boolean {
  return value === 'true';
}
