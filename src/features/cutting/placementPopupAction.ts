export function runPlacementPopupAction(action: () => void, close: () => void): void {
  action();
  close();
}
