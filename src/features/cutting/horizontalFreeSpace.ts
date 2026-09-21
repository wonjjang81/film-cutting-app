export type RectangularPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type HorizontalFreeSpace = {
  leftMm: number;
  rightMm: number;
  widthMm: number;
  yMm: number;
};

type Interval = { left: number; right: number };

/**
 * Finds the uninterrupted horizontal free space at a point on a roll.
 * Only pieces that cross the clicked Y coordinate block the horizontal line.
 */
export function horizontalFreeSpaceAtPoint(
  placements: readonly RectangularPlacement[],
  rollWidthMm: number,
  xMm: number,
  yMm: number,
  minimumWidthMm = 30,
): HorizontalFreeSpace | null {
  if (![rollWidthMm, xMm, yMm, minimumWidthMm].every(Number.isFinite) || rollWidthMm <= 0 || xMm < 0 || xMm > rollWidthMm || yMm < 0) return null;

  const occupied = placements
    .filter((placement) => placement.width > 0 && placement.height > 0 && yMm >= placement.y && yMm <= placement.y + placement.height)
    .map<Interval>((placement) => ({
      left: Math.max(0, placement.x),
      right: Math.min(rollWidthMm, placement.x + placement.width),
    }))
    .filter((interval) => interval.right > interval.left)
    .sort((a, b) => a.left - b.left);

  const merged: Interval[] = [];
  occupied.forEach((interval) => {
    const previous = merged[merged.length - 1];
    if (!previous || interval.left > previous.right) merged.push({ ...interval });
    else previous.right = Math.max(previous.right, interval.right);
  });

  let gapLeft = 0;
  for (const interval of merged) {
    if (xMm >= gapLeft && xMm < interval.left) return makeGap(gapLeft, interval.left, yMm, minimumWidthMm);
    if (xMm >= interval.left && xMm <= interval.right) return null;
    gapLeft = Math.max(gapLeft, interval.right);
  }

  if (xMm >= gapLeft && xMm <= rollWidthMm) return makeGap(gapLeft, rollWidthMm, yMm, minimumWidthMm);
  return null;
}

function makeGap(leftMm: number, rightMm: number, yMm: number, minimumWidthMm: number): HorizontalFreeSpace | null {
  const widthMm = rightMm - leftMm;
  return widthMm >= minimumWidthMm ? { leftMm, rightMm, widthMm, yMm } : null;
}
