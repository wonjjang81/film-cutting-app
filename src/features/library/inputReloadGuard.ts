export function isReloadShortcut(event: {key: string; ctrlKey: boolean; metaKey: boolean}): boolean {
  return event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r');
}
/** Browser/OS toolbar reload cannot be vetoed reliably; persisted input remains authoritative. */
export function installInputReloadGuard(target: Window): () => void {
  const keydown = (event: KeyboardEvent) => { if (isReloadShortcut(event)) event.preventDefault(); };
  const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
  target.addEventListener('keydown', keydown);
  target.addEventListener('beforeunload', unload);
  return () => { target.removeEventListener('keydown', keydown); target.removeEventListener('beforeunload', unload); };
}
