import { expect, it } from 'vitest';
import { subgroupAppearance, sizeStroke } from './placementAppearance';

it('assigns different colors before reuse, and keeps group colors stable when placements reorder', () => {
  const titles = Array.from({ length: 16 }, (_, index) => `대그룹1 · 소그룹${index + 1}`);
  const styles = subgroupAppearance(titles);
  expect(new Set(styles.values()).size).toBe(titles.length);
  expect(subgroupAppearance([...titles].reverse())).toEqual(styles);
});

it('keeps size patterns on rotation and provides multiple visual classes', () => {
  expect(sizeStroke(300, 600)).toBe(sizeStroke(600, 300));
  expect(new Set(Array.from({length:20}, (_, i) => sizeStroke(100+i, 200))).size).toBeGreaterThan(1);
});
