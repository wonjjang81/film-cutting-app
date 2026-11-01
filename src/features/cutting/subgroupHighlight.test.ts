import { expect, it } from 'vitest';
import { subgroupHighlightOptions, subgroupHighlightStyle } from './subgroupHighlight';
it('groups pieces across rolls while distinguishing major groups and locations', () => {
  const placements = [{ id: 1, sourceId: 'a' }, { id: 2, sourceId: 'b' }, { id: 3, sourceId: 'c' }, { id: 4, sourceId: 'd', siteName: '상부장2' }];
  const before = JSON.stringify(placements);
  const options = subgroupHighlightOptions(placements, { a:'상부장', b:'상부장', c:'상부장', d:'상부장' }, { a:'대그룹1', b:'대그룹1', c:'대그룹2', d:'대그룹1' });
  expect(options.map(option => option.title)).toEqual(['대그룹1 · 상부장', '대그룹2 · 상부장', '대그룹1 · 상부장2']);
  expect(options[0]!.placementIds).toEqual(new Set([1,2]));
  expect(options[0]!.count).toBe(2);
  expect(JSON.stringify(placements)).toBe(before);
});
it('handles unclassified and empty inputs without losing pieces', () => {
  expect(subgroupHighlightOptions([])).toEqual([]);
  expect(subgroupHighlightOptions([{id:1,sourceId:'a'}])[0]!.title).toBe('미분류');
});
it('dims only unrelated pieces and restores the original appearance for all view', () => {
  expect(subgroupHighlightStyle(true).opacity).toBe(1);
  expect(subgroupHighlightStyle(false).opacity).toBeLessThan(0.2);
  expect(subgroupHighlightStyle(true).strokeWidth).toBeGreaterThan(subgroupHighlightStyle(null).strokeWidth);
  expect(subgroupHighlightStyle(null)).toEqual({opacity:1,fillAlpha:'22',strokeWidth:2});
});
