import {
  type FilmPreset,
  type FilmRemnant,
  type LibraryDocument,
  type LibraryLoadResult,
  type SavedContinuousRollInput,
  type SavedCuttingJob,
  type SavedCuttingResultSummary,
  type SavedMergedCuttingJob,
  type SavedMergedPlacement,
  type SavedRemnantSummary,
  type SavedProject,
} from './models';

export const LIBRARY_STORAGE_KEY = 'film-cutting-library-v1';
const MAX_SAVED_JOBS = 20;
const MAX_SAVED_PROJECTS = 20;

export type KeyValueAdapter = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
};

/** Structurally compatible with the Task-2 inventory delta without importing it. */
export type InventoryDelta = {
  removeIds: string[];
  add: FilmRemnant[];
  basedOnUpdatedAt: Record<string, string>;
};

export type LibraryRepository = {
  load(): Promise<LibraryLoadResult>;
  /** Returns the validated library document as a portable JSON file body. */
  exportDocument(): Promise<string>;
  /** Replaces the library with a validated document from a portable JSON file body. */
  importDocument(raw: string): Promise<LibraryLoadResult>;
  savePreset(preset: FilmPreset): Promise<void>;
  deletePreset(id: string): Promise<void>;
  saveJob(job: SavedCuttingJob): Promise<void>;
  /** Saves a complete group-calculation result in one read-modify-write transaction. */
  saveBatchJobs(jobs: readonly SavedCuttingJob[], mergedJobs: readonly SavedMergedCuttingJob[]): Promise<void>;
  /** Saves one legacy-style project header and replaces its complete job bundle atomically. */
  saveProjectBundle(project: SavedProject, jobs: readonly SavedCuttingJob[], mergedJobs: readonly SavedMergedCuttingJob[]): Promise<void>;
  renameProject(id: string, name: string, updatedAt: string): Promise<void>;
  deleteProject(id: string): Promise<void>;
  renameJob(id: string, name: string, updatedAt: string): Promise<void>;
  deleteJob(id: string): Promise<void>;
  saveMergedJob(job: SavedMergedCuttingJob): Promise<void>;
  deleteMergedJob(id: string): Promise<void>;
  saveRemnant(remnant: FilmRemnant): Promise<void>;
  deleteRemnant(id: string): Promise<void>;
  applyInventoryDelta(delta: InventoryDelta): Promise<void>;
  confirmJob(job: SavedCuttingJob, delta: InventoryDelta): Promise<void>;
  confirmJobs(jobs: readonly SavedCuttingJob[], delta: InventoryDelta): Promise<void>;
  confirmMergedJob(job: SavedMergedCuttingJob, delta: InventoryDelta): Promise<void>;
};

type Validator<T> = (value: unknown) => T | undefined;

function emptyDocument(): LibraryDocument {
  return { version: 1, presets: [], jobs: [], remnants: [], mergedJobs: [] };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonblankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringValue(value: unknown): value is string {
  return typeof value === 'string';
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function finiteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return finitePositive(value) && Number.isInteger(value);
}

const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = ISO_INSTANT.exec(value);
  if (match === null) return undefined;
  const [, year = '', month = '', day = '', hour = '', minute = '', second = '', zone = ''] = match;
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const numericHour = Number(hour);
  const numericMinute = Number(minute);
  const numericSecond = Number(second);
  const zoneHours = zone === 'Z' ? 0 : Number(zone.slice(1, 3));
  const zoneMinutes = zone === 'Z' ? 0 : Number(zone.slice(4, 6));
  const isLeapYear = numericYear % 4 === 0 && (numericYear % 100 !== 0 || numericYear % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][numericMonth - 1] ?? 0;
  if (numericMonth < 1 || numericMonth > 12
    || numericDay < 1 || numericDay > daysInMonth
    || numericHour > 23 || numericMinute > 59 || numericSecond > 59
    || zoneHours > 23 || zoneMinutes > 59) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function validId(value: unknown): value is string {
  return nonblankString(value);
}

function validateInput(value: unknown): SavedContinuousRollInput | undefined {
  if (!isRecord(value)
    || !finitePositive(value.rollWidthMm)
    || !finitePositive(value.pieceWidthMm)
    || !finitePositive(value.pieceLengthMm)
    || !positiveInteger(value.quantity)
    || !finiteNonnegative(value.gapMm)
    || !finiteNonnegative(value.sideMarginMm)
    || !finiteNonnegative(value.startEndMarginMm)
    || typeof value.allowRotation !== 'boolean') return undefined;
  if (value.maxLengthMm !== undefined && !finitePositive(value.maxLengthMm)) return undefined;
  return {
    rollWidthMm: value.rollWidthMm,
    pieceWidthMm: value.pieceWidthMm,
    pieceLengthMm: value.pieceLengthMm,
    quantity: value.quantity,
    gapMm: value.gapMm,
    sideMarginMm: value.sideMarginMm,
    startEndMarginMm: value.startEndMarginMm,
    allowRotation: value.allowRotation,
    ...(value.maxLengthMm === undefined ? {} : { maxLengthMm: value.maxLengthMm }),
  };
}

function validateRemnantSummary(value: unknown): SavedRemnantSummary | undefined {
  if (!isRecord(value)
    || !validId(value.id)
    || !finitePositive(value.widthMm)
    || !finitePositive(value.lengthMm)
    || !positiveInteger(value.quantity)) return undefined;
  return { id: value.id, widthMm: value.widthMm, lengthMm: value.lengthMm, quantity: value.quantity };
}

function validateResult(value: unknown): SavedCuttingResultSummary | undefined {
  if (!isRecord(value)
    || !finiteNonnegative(value.newRollLengthMm)
    || !positiveInteger(value.producedQuantity)
    || !finiteNonnegative(value.overproduction)
    || !finiteNonnegative(value.utilizationPercent)
    || !finiteNonnegative(value.wastePercent)
    || (value.optimizationStatus !== 'exact'
      && value.optimizationStatus !== 'certified'
      && value.optimizationStatus !== 'approximate')) return undefined;
  return {
    newRollLengthMm: value.newRollLengthMm,
    producedQuantity: value.producedQuantity,
    overproduction: value.overproduction,
    utilizationPercent: value.utilizationPercent,
    wastePercent: value.wastePercent,
    optimizationStatus: value.optimizationStatus,
  };
}

function validatePreset(value: unknown): FilmPreset | undefined {
  if (!isRecord(value)) return undefined;
  const createdAt = normalizeTimestamp(value.createdAt);
  const updatedAt = normalizeTimestamp(value.updatedAt);
  if (
    !validId(value.id)
    || !nonblankString(value.brand)
    || !stringValue(value.productNumber)
    || !finitePositive(value.rollWidthMm)
    || !finitePositive(value.pieceWidthMm)
    || !finitePositive(value.pieceLengthMm)
    || !finiteNonnegative(value.gapMm)
    || !finiteNonnegative(value.sideMarginMm)
    || !finiteNonnegative(value.startEndMarginMm)
    || typeof value.allowRotation !== 'boolean'
    || createdAt === undefined
    || updatedAt === undefined) return undefined;
  return {
    id: value.id, brand: value.brand, productNumber: value.productNumber,
    rollWidthMm: value.rollWidthMm, pieceWidthMm: value.pieceWidthMm, pieceLengthMm: value.pieceLengthMm,
    gapMm: value.gapMm, sideMarginMm: value.sideMarginMm, startEndMarginMm: value.startEndMarginMm,
    allowRotation: value.allowRotation, createdAt, updatedAt,
  };
}

function validateRemnant(value: unknown): FilmRemnant | undefined {
  if (!isRecord(value)) return undefined;
  const createdAt = normalizeTimestamp(value.createdAt);
  const updatedAt = normalizeTimestamp(value.updatedAt);
  if (
    !validId(value.id)
    || !nonblankString(value.brand)
    || !stringValue(value.productNumber)
    || !finitePositive(value.widthMm)
    || !finitePositive(value.lengthMm)
    || !positiveInteger(value.quantity)
    || createdAt === undefined
    || updatedAt === undefined
    || (value.note !== undefined && typeof value.note !== 'string')) return undefined;
  return {
    id: value.id, brand: value.brand, productNumber: value.productNumber,
    widthMm: value.widthMm, lengthMm: value.lengthMm, quantity: value.quantity,
    createdAt, updatedAt,
    ...(value.note === undefined ? {} : { note: value.note }),
  };
}

function validateJob(value: unknown): SavedCuttingJob | undefined {
  if (!isRecord(value)) return undefined;
  const createdAt = normalizeTimestamp(value.createdAt);
  const updatedAt = normalizeTimestamp(value.updatedAt);
  if (
    !validId(value.id)
    || !nonblankString(value.name)
    || !nonblankString(value.brand)
    || !stringValue(value.productNumber)
    || createdAt === undefined
    || updatedAt === undefined
    || !Array.isArray(value.remnantIds)
    || !value.remnantIds.every(validId)
    || !Array.isArray(value.remnantSummary)) return undefined;
  const input = validateInput(value.input);
  const result = validateResult(value.result);
  const remnantSummary = value.remnantSummary.map(validateRemnantSummary);
  const cuttingCompletedAt = value.cuttingCompletedAt === undefined ? undefined : normalizeTimestamp(value.cuttingCompletedAt);
  const inventoryConfirmedAt = value.inventoryConfirmedAt === undefined ? undefined : normalizeTimestamp(value.inventoryConfirmedAt);
  const completedPlacementIds = value.completedPlacementIds === undefined ? undefined : value.completedPlacementIds;
  if (input === undefined || result === undefined || remnantSummary.some((item) => item === undefined)) return undefined;
  if (value.isCuttingComplete !== undefined && typeof value.isCuttingComplete !== 'boolean') return undefined;
  if (value.groupId !== undefined && typeof value.groupId !== 'string') return undefined;
  if (value.filmName !== undefined && typeof value.filmName !== 'string') return undefined;
  if (value.subgroupName !== undefined && typeof value.subgroupName !== 'string') return undefined;
  if (value.difficulty !== undefined && value.difficulty !== 'low' && value.difficulty !== 'medium' && value.difficulty !== 'high') return undefined;
  if (value.materialCostPerM !== undefined && !finiteNonnegative(value.materialCostPerM)) return undefined;
  if (value.constructionCostPerM2 !== undefined && !finiteNonnegative(value.constructionCostPerM2)) return undefined;
  if (value.cuttingCompletedAt !== undefined && cuttingCompletedAt === undefined) return undefined;
  if (value.isInventoryConfirmed !== undefined && typeof value.isInventoryConfirmed !== 'boolean') return undefined;
  if (value.inventoryConfirmedAt !== undefined && inventoryConfirmedAt === undefined) return undefined;
  if (completedPlacementIds !== undefined && (!Array.isArray(completedPlacementIds) || !completedPlacementIds.every((id) => positiveInteger(id)))) return undefined;
  return {
    id: value.id, name: value.name, brand: value.brand, productNumber: value.productNumber,
    ...(value.groupId === undefined ? {} : { groupId: value.groupId }),
    createdAt, updatedAt, input,
    ...(value.filmName === undefined ? {} : { filmName: value.filmName }),
    ...(value.subgroupName === undefined ? {} : { subgroupName: value.subgroupName }),
    ...(value.difficulty === undefined ? {} : { difficulty: value.difficulty }),
    ...(value.materialCostPerM === undefined ? {} : { materialCostPerM: value.materialCostPerM }),
    ...(value.constructionCostPerM2 === undefined ? {} : { constructionCostPerM2: value.constructionCostPerM2 }),
    remnantIds: [...value.remnantIds], remnantSummary: remnantSummary as SavedRemnantSummary[], result,
    ...(value.isCuttingComplete === undefined ? {} : { isCuttingComplete: value.isCuttingComplete }),
    ...(cuttingCompletedAt === undefined ? {} : { cuttingCompletedAt }),
    ...(completedPlacementIds === undefined ? {} : { completedPlacementIds: [...completedPlacementIds] }),
    ...(value.isInventoryConfirmed === undefined ? {} : { isInventoryConfirmed: value.isInventoryConfirmed }),
    ...(inventoryConfirmedAt === undefined ? {} : { inventoryConfirmedAt }),
  };
}

function validateMergedPlacement(value: unknown): SavedMergedPlacement | undefined {
  if (!isRecord(value)
    || !positiveInteger(value.id)
    || !validId(value.sourceId)
    || typeof value.instanceIndex !== 'number' || !Number.isInteger(value.instanceIndex) || value.instanceIndex < 0
    || !finiteNonnegative(value.x) || !finiteNonnegative(value.y)
    || !finitePositive(value.width) || !finitePositive(value.height)
    || typeof value.rotated !== 'boolean') return undefined;
  return {
    id: value.id, sourceId: value.sourceId, instanceIndex: value.instanceIndex,
    x: value.x, y: value.y, width: value.width, height: value.height, rotated: value.rotated,
  };
}

function validateMergedJob(value: unknown): SavedMergedCuttingJob | undefined {
  if (!isRecord(value)) return undefined;
  const createdAt = normalizeTimestamp(value.createdAt);
  const updatedAt = normalizeTimestamp(value.updatedAt);
  const cuttingCompletedAt = value.cuttingCompletedAt === undefined ? undefined : normalizeTimestamp(value.cuttingCompletedAt);
  if (!validId(value.id) || !nonblankString(value.name) || !validId(value.mergeGroupId)
    || !Array.isArray(value.groupNames) || !value.groupNames.every(nonblankString)
    || !Array.isArray(value.sourceJobIds) || !value.sourceJobIds.every(validId)
    || createdAt === undefined || updatedAt === undefined
    || !finitePositive(value.rollWidthMm) || !finiteNonnegative(value.usedLengthMm)
    || !positiveInteger(value.producedQuantity)
    || !finiteNonnegative(value.utilizationPercent) || !finiteNonnegative(value.wastePercent)
    || !Array.isArray(value.placements)) return undefined;
  const placements = value.placements.map(validateMergedPlacement);
  const sourceIds = value.sourceIds === undefined ? undefined : value.sourceIds;
  const completedPlacementIds = value.completedPlacementIds === undefined ? undefined : value.completedPlacementIds;
  const inventoryConfirmedAt = value.inventoryConfirmedAt === undefined ? undefined : normalizeTimestamp(value.inventoryConfirmedAt);
  const remnantIds = value.remnantIds === undefined ? undefined : value.remnantIds;
  const remnantSummary = value.remnantSummary === undefined
    ? undefined
    : Array.isArray(value.remnantSummary) ? value.remnantSummary.map(validateRemnantSummary) : null;
  if (placements.some((item) => item === undefined)
    || (value.isCuttingComplete !== undefined && typeof value.isCuttingComplete !== 'boolean')
    || (value.cuttingCompletedAt !== undefined && cuttingCompletedAt === undefined)
    || (completedPlacementIds !== undefined && (!Array.isArray(completedPlacementIds) || !completedPlacementIds.every((id) => positiveInteger(id))))
    || (value.isInventoryConfirmed !== undefined && typeof value.isInventoryConfirmed !== 'boolean')
    || (value.inventoryConfirmedAt !== undefined && inventoryConfirmedAt === undefined)
    || (remnantIds !== undefined && (!Array.isArray(remnantIds) || !remnantIds.every(validId)))
    || (sourceIds !== undefined && (!Array.isArray(sourceIds) || !sourceIds.every(validId)))
    || (remnantSummary === null || (remnantSummary !== undefined && remnantSummary.some((item) => item === undefined)))) return undefined;
  return {
    id: value.id, name: value.name, mergeGroupId: value.mergeGroupId,
    groupNames: [...value.groupNames], sourceJobIds: [...value.sourceJobIds],
    ...(sourceIds === undefined ? {} : { sourceIds: [...sourceIds] }),
    createdAt, updatedAt,
    rollWidthMm: value.rollWidthMm, usedLengthMm: value.usedLengthMm, producedQuantity: value.producedQuantity,
    utilizationPercent: value.utilizationPercent, wastePercent: value.wastePercent,
    placements: placements as SavedMergedPlacement[],
    ...(value.isCuttingComplete === undefined ? {} : { isCuttingComplete: value.isCuttingComplete }),
    ...(cuttingCompletedAt === undefined ? {} : { cuttingCompletedAt }),
    ...(completedPlacementIds === undefined ? {} : { completedPlacementIds: [...completedPlacementIds] }),
    ...(remnantIds === undefined ? {} : { remnantIds: [...remnantIds] }),
    ...(remnantSummary === undefined ? {} : { remnantSummary: remnantSummary as SavedRemnantSummary[] }),
    ...(value.isInventoryConfirmed === undefined ? {} : { isInventoryConfirmed: value.isInventoryConfirmed }),
    ...(inventoryConfirmedAt === undefined ? {} : { inventoryConfirmedAt }),
  };
}

function validateProject(value: unknown): SavedProject | undefined {
  if (!isRecord(value)) return undefined;
  const createdAt = normalizeTimestamp(value.createdAt);
  const updatedAt = normalizeTimestamp(value.updatedAt);
  if (!validId(value.id) || !nonblankString(value.name)
    || !Array.isArray(value.jobIds) || !value.jobIds.every(validId)
    || !Array.isArray(value.mergedJobIds) || !value.mergedJobIds.every(validId)
    || !finiteNonnegative(value.materialCostPerM) || !finiteNonnegative(value.constructionCostPerM2)
    || createdAt === undefined || updatedAt === undefined) return undefined;
  return {
    id: value.id,
    name: value.name.trim(),
    jobIds: [...value.jobIds],
    mergedJobIds: [...value.mergedJobIds],
    materialCostPerM: value.materialCostPerM,
    constructionCostPerM2: value.constructionCostPerM2,
    createdAt,
    updatedAt,
  };
}

function validateCollection<T extends { id: string }>(
  value: unknown,
  name: string,
  validator: Validator<T>,
  warnings: string[],
): T[] {
  if (!Array.isArray(value)) {
    warnings.push(`${name} must be an array; it was reset.`);
    return [];
  }
  const ids = new Set<string>();
  const valid: T[] = [];
  value.forEach((item, index) => {
    const parsed = validator(item);
    if (parsed === undefined) {
      warnings.push(`${name}[${index}] was invalid and was ignored.`);
    } else if (ids.has(parsed.id)) {
      warnings.push(`${name}[${index}] duplicated ID "${parsed.id}" and was ignored.`);
    } else {
      ids.add(parsed.id);
      valid.push(parsed);
    }
  });
  return valid;
}

function parseDocument(raw: string | null): LibraryLoadResult {
  if (raw === null) return { document: emptyDocument(), warnings: [] };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { document: emptyDocument(), warnings: ['Saved library was corrupted and was reset.'] };
  }
  if (!isRecord(value)) {
    return { document: emptyDocument(), warnings: ['Saved library was not an object and was reset.'] };
  }
  if (value.version !== 1) {
    return { document: emptyDocument(), warnings: ['Saved library version is unsupported and was reset.'] };
  }
  const warnings: string[] = [];
  const document: LibraryDocument = {
    version: 1,
    presets: validateCollection(value.presets, 'presets', validatePreset, warnings),
    jobs: validateCollection(value.jobs, 'jobs', validateJob, warnings),
    remnants: validateCollection(value.remnants, 'remnants', validateRemnant, warnings),
    mergedJobs: value.mergedJobs === undefined
      ? []
      : validateCollection(value.mergedJobs, 'mergedJobs', validateMergedJob, warnings),
    projects: value.projects === undefined
      ? []
      : validateCollection(value.projects, 'projects', validateProject, warnings),
  };
  return { document, warnings };
}

function replaceById<T extends { id: string }>(items: readonly T[], next: T): T[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) return [...items, clone(next)];
  return items.map((item, itemIndex) => itemIndex === index ? clone(next) : clone(item));
}

function assertValid<T>(value: T, validator: Validator<T>, name: string): T {
  const parsed = validator(value);
  if (parsed === undefined) throw new Error(`Invalid ${name}.`);
  return parsed;
}

function assertId(id: string): void {
  if (!validId(id)) throw new Error('ID must be nonblank.');
}

function isOptimisticConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes('다른 기기에서 프로젝트가 변경되었습니다');
}

function orderJobs(jobs: readonly SavedCuttingJob[]): SavedCuttingJob[] {
  return jobs
    .map(clone)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
    .slice(0, MAX_SAVED_JOBS);
}

function sortJobs(jobs: readonly SavedCuttingJob[]): SavedCuttingJob[] {
  return jobs
    .map(clone)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
}

function orderMergedJobs(jobs: readonly SavedMergedCuttingJob[]): SavedMergedCuttingJob[] {
  return jobs
    .map(clone)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
    .slice(0, MAX_SAVED_JOBS);
}

function sortMergedJobs(jobs: readonly SavedMergedCuttingJob[]): SavedMergedCuttingJob[] {
  return jobs
    .map(clone)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
}

function orderProjects(projects: readonly SavedProject[]): SavedProject[] {
  return projects
    .map(clone)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
    .slice(0, MAX_SAVED_PROJECTS);
}

function isPartialCarryForward(source: FilmRemnant, replacement: FilmRemnant): boolean {
  return replacement.quantity > 0
    && replacement.quantity < source.quantity
    && replacement.brand === source.brand
    && replacement.productNumber === source.productNumber
    && replacement.widthMm === source.widthMm
    && replacement.lengthMm === source.lengthMm
    && replacement.createdAt === source.createdAt
    && replacement.updatedAt === source.updatedAt
    && replacement.note === source.note;
}

function applyInventoryDeltaToDocument(document: LibraryDocument, delta: InventoryDelta): void {
  if (!isRecord(delta)
    || !Array.isArray(delta.removeIds)
    || !delta.removeIds.every(validId)
    || !isRecord(delta.basedOnUpdatedAt)
    || !Array.isArray(delta.add)) throw new Error('Invalid inventory delta.');
  const removeIds = new Set(delta.removeIds);
  if (removeIds.size !== delta.removeIds.length) throw new Error('Inventory delta removes a remnant more than once.');
  const additions = delta.add.map((item) => assertValid(item, validateRemnant, 'inventory remnant'));
  const addIds = new Set(additions.map((item) => item.id));
  if (addIds.size !== additions.length) throw new Error('Inventory delta adds duplicate remnant IDs.');

  const currentById = new Map(document.remnants.map((remnant) => [remnant.id, remnant]));
  for (const removeId of removeIds) {
    const source = currentById.get(removeId);
    const basedOn = normalizeTimestamp(delta.basedOnUpdatedAt[removeId]);
    if (source === undefined || basedOn === undefined || source.updatedAt !== basedOn) {
      throw new Error(`Inventory remnant "${removeId}" is missing or stale.`);
    }
  }
  if (Object.keys(delta.basedOnUpdatedAt).some((id) => !removeIds.has(id) || normalizeTimestamp(delta.basedOnUpdatedAt[id]) === undefined)) {
    throw new Error('Inventory delta has an invalid version check.');
  }
  for (const addition of additions) {
    if (currentById.has(addition.id) && !removeIds.has(addition.id)) {
      throw new Error(`Inventory addition "${addition.id}" conflicts with an untouched remnant.`);
    }
    if (removeIds.has(addition.id)) {
      const source = currentById.get(addition.id);
      if (source === undefined || !isPartialCarryForward(source, addition)) {
        throw new Error(`Inventory replacement "${addition.id}" is not a partial carry-forward.`);
      }
    }
  }
  document.remnants = [
    ...document.remnants.filter((remnant) => !removeIds.has(remnant.id)),
    ...additions.map(clone),
  ];
}

/**
 * A single-process repository. Its promise queue prevents lost updates among
 * calls through this instance; separate instances need a stronger storage API.
 */
export function createLibraryRepository(adapter: KeyValueAdapter): LibraryRepository {
  let mutationQueue: Promise<void> = Promise.resolve();

  const readStorage = async (): Promise<LibraryLoadResult> => parseDocument(await adapter.get(LIBRARY_STORAGE_KEY));

  const readForMutation = async (): Promise<LibraryLoadResult> => {
    const loaded = await readStorage();
    if (loaded.warnings.length > 0) {
      throw new Error('Saved library must be recovered before it can be changed.');
    }
    return loaded;
  };

  const read = async (): Promise<LibraryLoadResult> => {
    try {
      return await readStorage();
    } catch {
      return { document: emptyDocument(), warnings: ['Saved library could not be read and was reset.'] };
    }
  };

  const mutate = <T>(operation: (document: LibraryDocument) => T): Promise<T> => {
    const run = async (): Promise<T> => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const loaded = await readForMutation();
        const document = clone(loaded.document);
        const result = operation(document);
        try {
          await adapter.set(LIBRARY_STORAGE_KEY, JSON.stringify(document));
          return result;
        } catch (error) {
          // A concurrent writer can invalidate the ETag between the read and
          // write. Re-read and reapply this pure document operation once so
          // normal multi-device activity does not break a group calculation.
          if (!isOptimisticConflict(error) || attempt > 0) throw error;
        }
      }
      throw new Error('프로젝트 저장을 다시 시도하지 못했습니다.');
    };
    const pending = mutationQueue.then(run, run);
    mutationQueue = pending.then(() => undefined, () => undefined);
    return pending;
  };

  return {
    async load(): Promise<LibraryLoadResult> {
      const loaded = await read();
      return { document: clone(loaded.document), warnings: [...loaded.warnings] };
    },

    async exportDocument(): Promise<string> {
      const loaded = await read();
      if (loaded.warnings.length > 0) throw new Error(loaded.warnings.join(' '));
      return JSON.stringify(loaded.document, null, 2);
    },

    async importDocument(raw: string): Promise<LibraryLoadResult> {
      if (typeof raw !== 'string' || raw.trim().length === 0) throw new Error('가져올 프로젝트 파일이 비어 있습니다.');
      const parsed = parseDocument(raw);
      if (parsed.warnings.length > 0) throw new Error(`프로젝트 파일을 가져오지 못했습니다. ${parsed.warnings.join(' ')}`);
      await mutate((document) => {
        document.version = parsed.document.version;
        document.presets = clone(parsed.document.presets);
        document.jobs = orderJobs(parsed.document.jobs);
        document.remnants = clone(parsed.document.remnants);
        document.mergedJobs = orderMergedJobs(parsed.document.mergedJobs);
        document.projects = orderProjects(parsed.document.projects ?? []);
      });
      return { document: clone(parsed.document), warnings: [] };
    },

    async savePreset(preset): Promise<void> {
      const valid = assertValid(preset, validatePreset, 'preset');
      await mutate((document) => {
        document.presets = replaceById(document.presets, valid);
      });
    },

    async deletePreset(id): Promise<void> {
      assertId(id);
      await mutate((document) => {
        document.presets = document.presets.filter((preset) => preset.id !== id);
      });
    },

    async saveJob(job): Promise<void> {
      const valid = assertValid(job, validateJob, 'job');
      await mutate((document) => {
        document.jobs = orderJobs(replaceById(document.jobs, valid));
      });
    },

    async saveBatchJobs(jobs, mergedJobs): Promise<void> {
      const validJobs = jobs.map((job) => assertValid(job, validateJob, 'job'));
      const validMergedJobs = mergedJobs.map((job) => assertValid(job, validateMergedJob, 'merged cutting job'));
      const allIds = [...validJobs.map((job) => job.id), ...validMergedJobs.map((job) => job.id)];
      if (new Set(allIds).size !== allIds.length) throw new Error('동일 작업을 여러 번 저장할 수 없습니다.');
      await mutate((document) => {
        document.jobs = orderJobs(validJobs.reduce((items, job) => replaceById(items, job), document.jobs));
        document.mergedJobs = orderMergedJobs(validMergedJobs.reduce((items, job) => replaceById(items, job), document.mergedJobs));
      });
    },

    async saveProjectBundle(project, jobs, mergedJobs): Promise<void> {
      const validProject = assertValid(project, validateProject, 'project');
      const validJobs = jobs.map((job) => assertValid(job, validateJob, 'job'));
      const validMergedJobs = mergedJobs.map((job) => assertValid(job, validateMergedJob, 'merged cutting job'));
      const allIds = [...validJobs.map((job) => job.id), ...validMergedJobs.map((job) => job.id)];
      if (new Set(allIds).size !== allIds.length) throw new Error('동일 작업을 여러 번 저장할 수 없습니다.');
      if (new Set(validProject.jobIds).size !== validProject.jobIds.length || new Set(validProject.mergedJobIds).size !== validProject.mergedJobIds.length) {
        throw new Error('프로젝트 작업 목록에 중복 ID가 있습니다.');
      }
      await mutate((document) => {
        const previous = (document.projects ?? []).find((item) => item.id === validProject.id);
        const replacedJobIds = new Set([...(previous?.jobIds ?? []), ...validProject.jobIds]);
        const replacedMergedIds = new Set([...(previous?.mergedJobIds ?? []), ...validProject.mergedJobIds]);
        document.jobs = sortJobs([
          ...document.jobs.filter((job) => !replacedJobIds.has(job.id)),
          ...validJobs,
        ]);
        document.mergedJobs = sortMergedJobs([
          ...document.mergedJobs.filter((job) => !replacedMergedIds.has(job.id)),
          ...validMergedJobs,
        ]);
        document.projects = orderProjects(replaceById(document.projects ?? [], validProject));
      });
    },

    async renameProject(id, name, updatedAt): Promise<void> {
      assertId(id);
      if (!nonblankString(name)) throw new Error('Project name must be nonblank.');
      const normalizedUpdatedAt = normalizeTimestamp(updatedAt);
      if (normalizedUpdatedAt === undefined) throw new Error('Project updatedAt must be an ISO timestamp.');
      await mutate((document) => {
        document.projects = orderProjects((document.projects ?? []).map((project) => project.id === id
          ? { ...project, name: name.trim(), updatedAt: normalizedUpdatedAt }
          : clone(project)));
      });
    },

    async deleteProject(id): Promise<void> {
      assertId(id);
      await mutate((document) => {
        const project = (document.projects ?? []).find((item) => item.id === id);
        const jobIds = new Set(project?.jobIds ?? []);
        const mergedIds = new Set(project?.mergedJobIds ?? []);
        document.jobs = document.jobs.filter((job) => !jobIds.has(job.id));
        document.mergedJobs = document.mergedJobs.filter((job) => !mergedIds.has(job.id));
        document.projects = (document.projects ?? []).filter((item) => item.id !== id);
      });
    },

    async renameJob(id, name, updatedAt): Promise<void> {
      assertId(id);
      if (!nonblankString(name)) throw new Error('Job name must be nonblank.');
      const normalizedUpdatedAt = normalizeTimestamp(updatedAt);
      if (normalizedUpdatedAt === undefined) throw new Error('Job updatedAt must be an ISO timestamp.');
      await mutate((document) => {
        document.jobs = orderJobs(document.jobs.map((job) => job.id === id
          ? { ...job, name, updatedAt: normalizedUpdatedAt }
          : clone(job)));
      });
    },

    async deleteJob(id): Promise<void> {
      assertId(id);
      await mutate((document) => {
        document.jobs = document.jobs.filter((job) => job.id !== id);
      });
    },

    async saveMergedJob(job): Promise<void> {
      const valid = assertValid(job, validateMergedJob, 'merged cutting job');
      await mutate((document) => {
        document.mergedJobs = orderMergedJobs(replaceById(document.mergedJobs, valid));
      });
    },

    async deleteMergedJob(id): Promise<void> {
      assertId(id);
      await mutate((document) => {
        document.mergedJobs = document.mergedJobs.filter((job) => job.id !== id);
      });
    },

    async saveRemnant(remnant): Promise<void> {
      const valid = assertValid(remnant, validateRemnant, 'remnant');
      await mutate((document) => {
        document.remnants = replaceById(document.remnants, valid);
      });
    },

    async deleteRemnant(id): Promise<void> {
      assertId(id);
      await mutate((document) => {
        document.remnants = document.remnants.filter((remnant) => remnant.id !== id);
      });
    },

    async applyInventoryDelta(delta): Promise<void> {
      await mutate((document) => {
        applyInventoryDeltaToDocument(document, delta);
      });
    },

    async confirmJob(job, delta): Promise<void> {
      const valid = assertValid(job, validateJob, 'job');
      await mutate((document) => {
        if (document.jobs.some((stored) => stored.id === valid.id && stored.isInventoryConfirmed)) {
          throw new Error('이미 재고 확정된 작업입니다.');
        }
        applyInventoryDeltaToDocument(document, delta);
        const now = new Date().toISOString();
        document.jobs = orderJobs(replaceById(document.jobs, { ...valid, isInventoryConfirmed: true, inventoryConfirmedAt: now }));
      });
    },

    async confirmJobs(jobs, delta): Promise<void> {
      const validJobs = jobs.map((job) => assertValid(job, validateJob, 'job'));
      const ids = new Set(validJobs.map((job) => job.id));
      if (ids.size !== validJobs.length) throw new Error('동일 작업을 여러 번 확정할 수 없습니다.');
      await mutate((document) => {
        if (validJobs.some((job) => !document.jobs.some((stored) => stored.id === job.id))) {
          throw new Error('확정 대상 작업을 찾을 수 없습니다. 다시 계산해 주세요.');
        }
        if (validJobs.some((job) => document.jobs.some((stored) => stored.id === job.id && stored.isInventoryConfirmed))) {
          throw new Error('이미 재고 확정된 작업이 포함되어 있습니다.');
        }
        applyInventoryDeltaToDocument(document, delta);
        const now = new Date().toISOString();
        const confirmed = new Map(validJobs.map((job) => [job.id, { ...job, isInventoryConfirmed: true, inventoryConfirmedAt: now }]));
        document.jobs = orderJobs(document.jobs.map((job) => confirmed.get(job.id) ?? clone(job)));
      });
    },

    async confirmMergedJob(job, delta): Promise<void> {
      const valid = assertValid(job, validateMergedJob, 'merged cutting job');
      await mutate((document) => {
        const stored = document.mergedJobs.find((candidate) => candidate.id === valid.id);
        if (stored === undefined) throw new Error('확정 대상 병합 롤을 찾을 수 없습니다. 다시 계산해 주세요.');
        if (stored.isInventoryConfirmed) throw new Error('이미 재고 확정된 병합 롤입니다.');
        if (valid.sourceJobIds.some((sourceId) => document.jobs.some((source) => source.id === sourceId && source.isInventoryConfirmed))) {
          throw new Error('병합 롤의 원본 조각이 이미 재고 확정되었습니다.');
        }
        applyInventoryDeltaToDocument(document, delta);
        const now = new Date().toISOString();
        document.mergedJobs = orderMergedJobs(replaceById(document.mergedJobs, { ...valid, isInventoryConfirmed: true, inventoryConfirmedAt: now }));
      });
    },
  };
}
