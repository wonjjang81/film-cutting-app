import { describe, expect, it } from 'vitest';
import { compactBrandSelectWidth, DEFAULT_BRANDS, isDefaultBrand, normalizeBrandList } from './brandOptions';

describe('brand options', () => {
  it('keeps the built-in order and removes duplicate custom brands', () => {
    expect(normalizeBrandList(['삼성', '  한샘  ', '한샘'], 'LX')).toEqual([...DEFAULT_BRANDS, '한샘']);
  });

  it('recognizes built-in brands as non-removable', () => {
    expect(isDefaultBrand('영림')).toBe(true);
    expect(isDefaultBrand('한샘')).toBe(false);
  });
});

describe('compactBrandSelectWidth', () => {
  it('keeps short brands narrow and grows for longer custom brands within limits', () => {
    expect(compactBrandSelectWidth('Lx')).toBe(58);
    expect(compactBrandSelectWidth('영림')).toBe(58);
    expect(compactBrandSelectWidth('긴사용자브랜드')).toBeGreaterThan(58);
    expect(compactBrandSelectWidth('아주아주아주아주긴브랜드')).toBe(116);
  });
});
