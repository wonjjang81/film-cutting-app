import { LABOR_COST_PER_UNIT } from './installationLabor';

import { referenceWork, referenceParts, isLinearReference, preparationRates, type PreparationDifficulty, filmLossFactors, shapeFactors, type ReferencePart, type ReferenceShape, type FilmPattern } from './referenceEstimate';

export type InstallationWorkload = {
  enabled: boolean;
  sheets: string;
  finishingM: string;
  details: string;
  referencePart?: ReferencePart;
  quantity?: string;
  shape?: ReferenceShape;
  pattern?: FilmPattern;
  prepUnits?: string;
  preparationDifficulty?: PreparationDifficulty;
};

export const EMPTY_WORKLOAD: InstallationWorkload = { enabled: false, sheets: '', finishingM: '', details: '' };
export const WORK_MINUTES_PER_UNIT = 480;

function readQuantity(text: unknown, whole: boolean): number | undefined {
  if (typeof text !== 'string' || !(whole ? /^\d+$/ : /^\d+(?:\.\d+)?$/).test(text.trim())) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value <= 100_000 ? value : undefined;
}

export function estimateInstallationWorkload(areaM2: number, workload?: InstallationWorkload) {
  if (!workload || !Number.isFinite(areaM2) || areaM2 <= 0) return undefined;
  const shape = workload.shape && Object.hasOwn(shapeFactors, workload.shape) ? shapeFactors[workload.shape] : 1;
  if (workload.referencePart) {
    const linear = isLinearReference(workload.referencePart);
    const quantity = readQuantity(workload.quantity, !linear);
    const reference = quantity ? referenceWork(workload.referencePart, quantity) : undefined;
    if (!reference) return undefined;
    return { minutes: reference.units * shape * WORK_MINUTES_PER_UNIT,
      cost: Math.round(reference.units * shape * LABOR_COST_PER_UNIT), referenceMaterialM: reference.materialM };
  }
  const sheets = readQuantity(workload.sheets, true);
  const finishingM = readQuantity(workload.finishingM, false);
  const details = readQuantity(workload.details, true);
  if (!sheets || finishingM === undefined || details === undefined) return undefined;
  const minutes = (12 * areaM2 + 4 * sheets + 4 * finishingM + 5 * details) * shape;
  return { minutes, cost: Math.round(minutes / WORK_MINUTES_PER_UNIT * LABOR_COST_PER_UNIT) };
}

export function referencePreparationCost(workload: InstallationWorkload, areaM2: number): number | undefined {
  if (!workload.enabled || !workload.prepUnits?.trim()) {
    return Math.round(areaM2 * preparationRates[workload.preparationDifficulty ?? '없음']);
  }
  const units = readQuantity(workload.prepUnits, false);
  return units === undefined ? undefined : Math.round(units * LABOR_COST_PER_UNIT);
}

export function parseInstallationWorkloads(value: unknown): Record<string, InstallationWorkload> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, row]) => {
    if (!row || typeof row.enabled !== 'boolean' || !['sheets', 'finishingM', 'details'].every(key => typeof row[key] === 'string')) return [];
    return [[key, {
      enabled: row.enabled, sheets: row.sheets, finishingM: row.finishingM, details: row.details,
      referencePart: Object.hasOwn(referenceParts, row.referencePart) ? row.referencePart : undefined,
      shape: Object.hasOwn(shapeFactors, row.shape) ? row.shape : undefined,
      pattern: Object.hasOwn(filmLossFactors, row.pattern) ? row.pattern : undefined,
      quantity: typeof row.quantity === 'string' ? row.quantity : undefined,
      preparationDifficulty: Object.hasOwn(preparationRates, row.preparationDifficulty) ? row.preparationDifficulty : undefined,
      prepUnits: typeof row.prepUnits === 'string' ? row.prepUnits : undefined,
    }]];
  }));
}
