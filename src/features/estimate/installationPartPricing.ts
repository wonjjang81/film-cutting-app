/** Updated reference ranges in KRW/m. Defaults use the whole-project range midpoint. */
export type InstallationPartRate = { name: string; costPerM: number; reference?: string };
export const INSTALLATION_PARTS_STORAGE_KEY = 'film-cutting-installation-parts-v1';
export const DEFAULT_INSTALLATION_PARTS: readonly InstallationPartRate[] = [
  { name: '책장', costPerM: 26_500, reference: '최상 · 전체 25,000~28,000원/m · 단독 50,000원/m 이상' },
  { name: '화장대', costPerM: 20_000, reference: '상 · 전체 18,000~22,000원/m · 단독 70,000원/m 이상' },
  { name: '샷시 (내부)', costPerM: 16_500, reference: '상 · 전체 15,000~18,000원/m · 단독 25,000~30,000원/m · 실리콘 재코킹 비용 별도' },
  { name: '화장실문/문틀', costPerM: 15_000, reference: '중상 · 전체 14,000~16,000원/m · 단독 20,000~25,000원/m' },
  { name: '싱크대 하부장', costPerM: 14_500, reference: '중 · 전체 14,000~15,000원/m · 단독 40,000원/m 이상' },
  { name: '냉장고장', costPerM: 14_000, reference: '중 · 전체 13,000~15,000원/m · 단독 18,000~20,000원/m' },
  { name: '신발장', costPerM: 13_000, reference: '중하 · 전체 12,000~14,000원/m · 단독 35,000원/m 이상' },
  { name: '방문/문틀', costPerM: 11_500, reference: '하 · 전체 11,000~12,000원/m · 단독 20,000원/m 이상' },
  { name: '싱크대 상부장', costPerM: 11_750, reference: '하 · 전체 11,000~12,500원/m · 단독 45,000원/m 이상' },
  { name: '붙박이장', costPerM: 10_750, reference: '하 · 전체 10,000~11,500원/m · 단독 40,000원/m 이상' },
  { name: '아일랜드식탁', costPerM: 11_750, reference: '하 · 전체 11,000~12,500원/m · 단독 60,000원/m 이상' },
  { name: '드레스룸', costPerM: 11_500, reference: '하 · 전체 11,000~12,000원/m · 단독불가 (다른 공정과 병행)' },
];

export function parseInstallationParts(raw: string | null): InstallationPartRate[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const parts = new Map<string, InstallationPartRate>();
    for (const item of value) {
      if (item && typeof item.name === 'string' && item.name.trim() && typeof item.costPerM === 'number' && Number.isFinite(item.costPerM) && item.costPerM >= 0) {
        parts.set(item.name.trim(), { name: item.name.trim(), costPerM: Math.floor(item.costPerM) });
      }
    }
    return [...parts.values()];
  } catch { return []; }
}

export function installationPartOptions(custom: readonly InstallationPartRate[]): InstallationPartRate[] {
  const parts = new Map(DEFAULT_INSTALLATION_PARTS.map((part) => [part.name, part]));
  custom.forEach((part) => parts.set(part.name, { ...parts.get(part.name), ...part }));
  return [...parts.values()];
}
