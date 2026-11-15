export const referenceParts = {
  middleDoorLeaf: '중문 문',
  middleDoorFrame: '중문 문틀',
  middleDoor: '중문 문+문틀 세트',
  doorLeaf: '문',
  doorFrame: '문틀',
  door: '문+문틀 세트',
  entry: '현관문 실내측',
  window: '샷시 내부',
  kitchenUpper: '싱크대 상부장',
  kitchenLower: '싱크대 하부장',
  kitchen: '싱크대 상부장+하부장 세트',
  storage: '냉장고장·수납장',
  trim: '몰딩·걸레받이',
} as const;

export const shapeFactors = { '평판': 1, '알판': 1.25, '깊은 굴곡': 1.75, '루버·간살': 2.75 } as const;
export const preparationRates = { '없음': 0, '가벼움': 3_000, '보통': 6_000, '높음': 10_000 } as const;
export type PreparationDifficulty = keyof typeof preparationRates;
export const recessedCeilingRatePerM2 = 10_000;
export const filmLossFactors = { '단색': 0.1, '일반 우드': 0.15, '대형 패턴': 0.2 } as const;
export type ReferencePart = keyof typeof referenceParts;
export const quickReferenceParts = ['middleDoorLeaf', 'middleDoorFrame', 'middleDoor', 'doorLeaf', 'doorFrame', 'door', 'kitchenUpper', 'kitchenLower', 'kitchen'] as const;
export function isLinearReference(part: ReferencePart) {
  return part === 'kitchen' || part === 'kitchenUpper' || part === 'kitchenLower' || part === 'trim';
}

export type ReferenceShape = keyof typeof shapeFactors;
export type FilmPattern = keyof typeof filmLossFactors;

/** Attachment parameters. Quantity is the subgroup total in sets, or measured metres for linear parts. */
export function referenceWork(part: ReferencePart, quantity: number) {
  switch (part) {
    case 'middleDoorLeaf': return { units: 0.4 * quantity };
    case 'middleDoorFrame': return { units: 0.25 * quantity };
    case 'middleDoor': return { units: 0.65 * quantity };
    case 'doorLeaf': return { materialM: 4 * quantity, units: 0.3 * quantity };
    case 'doorFrame': return { materialM: 3 * quantity, units: 0.2 * quantity };
    case 'door': return { materialM: 7 * quantity, units: 0.5 * quantity };
    case 'entry': return { materialM: 3.5 * quantity, units: 0.4 * quantity };
    case 'window': return { materialM: 6.5 * quantity, units: 0.5 * quantity };
    case 'kitchenUpper': return { materialM: 1.1 * quantity, units: 0.06 * quantity };
    case 'kitchenLower': return { materialM: 1.4 * quantity, units: 0.09 * quantity };
    case 'kitchen': return { materialM: 2.5 * quantity, units: 0.15 * quantity };
    case 'storage': return { materialM: 14 * quantity, units: 0.9 * quantity };
    case 'trim': return { materialM: quantity / 3, units: quantity * 0.01 };
  }
}

export function referenceAreaLength(areaM2: number, pattern: FilmPattern) {
  return areaM2 / 1.22 * (1 + filmLossFactors[pattern]);
}
