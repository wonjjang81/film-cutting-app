import { describe, expect, it } from 'vitest';
import { DEFAULT_INSTALLATION_PARTS, installationPartOptions, parseInstallationParts } from './installationPartPricing';

describe('installation part price catalog', () => {
  it('preloads all twelve whole-project range midpoints from the updated reference', () => {
    expect(DEFAULT_INSTALLATION_PARTS.map((part) => [part.name, part.costPerM])).toEqual([
      ['책장', 26500], ['화장대', 20000], ['샷시 (내부)', 16500], ['화장실문/문틀', 15000],
      ['싱크대 하부장', 14500], ['냉장고장', 14000], ['신발장', 13000], ['방문/문틀', 11500],
      ['싱크대 상부장', 11750], ['붙박이장', 10750], ['아일랜드식탁', 11750], ['드레스룸', 11500],
    ]);
    expect(DEFAULT_INSTALLATION_PARTS).toHaveLength(12);
    expect(DEFAULT_INSTALLATION_PARTS.find((part) => part.name === '드레스룸')?.reference).toContain('단독불가');
    expect(DEFAULT_INSTALLATION_PARTS.find((part) => part.name === '샷시 (내부)')?.reference).toContain('재코킹 비용 별도');
  });
  it('preserves zero, trims names, deduplicates and rejects invalid saved entries', () => {
    const custom = parseInstallationParts(JSON.stringify([{ name: ' 벽체 ', costPerM: 12000 }, { name: '벽체', costPerM: 0 }, { name: '', costPerM: 100 }, { name: '잘못된 단가', costPerM: -1 }]));
    expect(custom).toEqual([{ name: '벽체', costPerM: 0 }]);
    expect(installationPartOptions(custom)).toHaveLength(13);
    expect(parseInstallationParts('{broken')).toEqual([]);
  });
  it('allows a saved custom default to override a preset without duplicate options', () => {
    const parts = installationPartOptions([{ name: '책장', costPerM: 30000 }]);
    expect(parts).toHaveLength(12);
    expect(parts.find((part) => part.name === '책장')?.costPerM).toBe(30000);
    expect(parts.find((part) => part.name === '책장')?.reference).toContain('25,000~28,000');
  });
});
