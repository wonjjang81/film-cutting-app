import { expect, it } from 'vitest';
import { subgroupColor, sizeStroke } from './placementAppearance';

it('uses a stable subgroup color across sources and major groups', () => {
  const groups = { a: '상부장', b: '상부장', c: '하부장' };
  expect(subgroupColor('a', groups)).toBe(subgroupColor('b', groups));
  expect(subgroupColor('a', groups)).not.toBe(subgroupColor('c', groups));
  expect(subgroupColor('a', groups, { a: '대그룹1' })).not.toBe(subgroupColor('b', groups, { b: '대그룹2' }));
  expect(subgroupColor('a')).toBe(subgroupColor('a'));
});

it('keeps size patterns on rotation and provides multiple visual classes', () => {
  expect(sizeStroke(300, 600)).toBe(sizeStroke(600, 300));
  expect(new Set(Array.from({length:20}, (_, i) => sizeStroke(100+i, 200))).size).toBeGreaterThan(1);
});
