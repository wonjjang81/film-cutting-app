export const referenceParts = {
  door: '방문+문틀',
  entry: '현관문 실내측',
  window: '샷시 내부',
  kitchen: '싱크대장',
  storage: '냉장고장·수납장',
  trim: '몰딩·걸레받이',
} as const;

export const shapeFactors = { '평판': 1, '알판': 1.25, '깊은 굴곡': 1.75, '루버·간살': 2.75 } as const;
export const filmLossFactors = { '단색': 0.1, '일반 우드': 0.15, '대형 패턴': 0.2 } as const;
export type ReferencePart = keyof typeof referenceParts;
export type ReferenceShape = keyof typeof shapeFactors;
export type FilmPattern = keyof typeof filmLossFactors;

/** Attachment parameters. Quantity is the subgroup total in sets, or measured metres for linear parts. */
export function referenceWork(part: ReferencePart, quantity: number) {
  switch (part) {
    case 'door': return { materialM: 7 * quantity, units: 0.5 * quantity };
    case 'entry': return { materialM: 3.5 * quantity, units: 0.4 * quantity };
    case 'window': return { materialM: 6.5 * quantity, units: 0.5 * quantity };
    case 'kitchen': return { materialM: 2.5 * quantity, units: 0.15 * quantity };
    case 'storage': return { materialM: 14 * quantity, units: 0.9 * quantity };
    case 'trim': return { materialM: quantity / 3, units: quantity * 0.01 };
  }
}

export function referenceAreaLength(areaM2: number, pattern: FilmPattern) {
  return areaM2 / 1.22 * (1 + filmLossFactors[pattern]);
}
