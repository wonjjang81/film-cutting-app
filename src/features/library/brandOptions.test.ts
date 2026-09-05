import { describe, expect, it } from 'vitest';
import { DEFAULT_BRANDS, isDefaultBrand, normalizeBrandList } from './brandOptions';

describe('brand options', () => {
  it('keeps the built-in order and removes duplicate custom brands', () => {
    expect(normalizeBrandList(['삼성', '  한샘  ', '한샘'], 'LX')).toEqual([...DEFAULT_BRANDS, '한샘']);
  });

  it('recognizes built-in brands as non-removable', () => {
    expect(isDefaultBrand('영림')).toBe(true);
    expect(isDefaultBrand('한샘')).toBe(false);
  });
});

