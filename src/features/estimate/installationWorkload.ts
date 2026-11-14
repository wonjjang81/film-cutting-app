import { LABOR_COST_PER_UNIT } from './installationLabor';

export type InstallationWorkload = {
  enabled: boolean;
  sheets: string;
  finishingM: string;
  details: string;
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
  const sheets = readQuantity(workload.sheets, true);
  const finishingM = readQuantity(workload.finishingM, false);
  const details = readQuantity(workload.details, true);
  if (!sheets || finishingM === undefined || details === undefined) return undefined;
  const minutes = 12 * areaM2 + 4 * sheets + 4 * finishingM + 5 * details;
  return { minutes, cost: Math.round(minutes / WORK_MINUTES_PER_UNIT * LABOR_COST_PER_UNIT) };
}

export function parseInstallationWorkloads(value: unknown): Record<string, InstallationWorkload> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, row]) =>
    row && typeof row.enabled === 'boolean' && ['sheets', 'finishingM', 'details'].every(key => typeof row[key] === 'string')));
}
