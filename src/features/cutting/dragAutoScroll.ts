const DEFAULT_EDGE_ZONE_PX = 48;
const DEFAULT_SCROLL_STEP_PX = 16;

/**
 * Keeps drag scrolling idle across the viewport and only scrolls when the
 * pointer reaches a narrow top or bottom edge zone.
 */
export function dragAutoScrollStep(
  viewportY: number,
  viewportHeight: number,
  edgeZonePx = DEFAULT_EDGE_ZONE_PX,
  scrollStepPx = DEFAULT_SCROLL_STEP_PX,
): number {
  if (!Number.isFinite(viewportY) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0;
  const safeEdgeZone = Math.max(0, Math.min(edgeZonePx, viewportHeight / 2));
  if (viewportY < safeEdgeZone) return -Math.abs(scrollStepPx);
  if (viewportY > viewportHeight - safeEdgeZone) return Math.abs(scrollStepPx);
  return 0;
}
