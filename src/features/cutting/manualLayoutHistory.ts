export type ManualLayoutHistory<T> = {
  baseline: T;
  past: T[];
  future: T[];
};

export type ManualLayoutTransition<T> = {
  history: ManualLayoutHistory<T>;
  value: T;
};

export function startManualLayoutHistory<T>(baseline: T): ManualLayoutHistory<T> {
  return { baseline, past: [], future: [] };
}

/** Starts a fresh edit history from the layout that was just persisted. */
export function rebaseManualLayoutHistory<T>(saved: T): ManualLayoutHistory<T> {
  return { baseline: saved, past: [], future: [] };
}

export function recordManualLayoutChange<T>(history: ManualLayoutHistory<T>, current: T): ManualLayoutHistory<T> {
  return { ...history, past: [...history.past, current], future: [] };
}

export function undoManualLayout<T>(history: ManualLayoutHistory<T>, current: T): ManualLayoutTransition<T> | null {
  const value = history.past.at(-1);
  if (value === undefined) return null;
  return { value, history: { ...history, past: history.past.slice(0, -1), future: [current, ...history.future] } };
}

export function redoManualLayout<T>(history: ManualLayoutHistory<T>, current: T): ManualLayoutTransition<T> | null {
  const [value, ...future] = history.future;
  if (value === undefined) return null;
  return { value, history: { ...history, past: [...history.past, current], future } };
}

export function resetManualLayout<T>(history: ManualLayoutHistory<T>, current: T): ManualLayoutTransition<T> {
  return { value: history.baseline, history: { ...history, past: [...history.past, current], future: [] } };
}
