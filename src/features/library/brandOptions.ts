export const DEFAULT_BRANDS = ['영림', '현대', 'Lx', '삼성'] as const;

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Keeps the built-in order while accepting valid user-defined brands. */
export function normalizeBrandList(raw: unknown, currentBrand = ''): string[] {
  const candidates = [
    ...DEFAULT_BRANDS,
    ...(Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : []),
    currentBrand,
  ].map(normalized).filter(Boolean);
  return candidates.filter((brand, index) => candidates.findIndex((item) => item.toLocaleLowerCase('ko-KR') === brand.toLocaleLowerCase('ko-KR')) === index);
}

export function isDefaultBrand(brand: string): boolean {
  return DEFAULT_BRANDS.some((item) => item.toLocaleLowerCase('ko-KR') === brand.trim().toLocaleLowerCase('ko-KR'));
}

