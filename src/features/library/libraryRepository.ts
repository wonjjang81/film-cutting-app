import {
  type FilmPreset,
  type FilmRemnant,
  type LibraryDocument,
  type LibraryLoadResult,
  type SavedContinuousRollInput,
  type SavedCuttingJob,
  type SavedCuttingResultSummary,
  type SavedRemnantSummary,
} from './models';

export const LIBRARY_STORAGE_KEY = 'film-cutting-library-v1';
const MAX_SAVED_JOBS = 20;

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
  savePreset(preset: FilmPreset): Promise<void>;
  deletePreset(id: string): Promise<void>;
  saveJob(job: SavedCuttingJob): Promise<void>;
  renameJob(id: string, name: string, updatedAt: string): Promise<void>;
  deleteJob(id: string): Promise<void>;
  saveRemnant(remnant: FilmRemnant): Promise<void>;
  deleteRemnant(id: string): Promise<void>;
  applyInventoryDelta(delta: InventoryDelta): Promise<void>;
};

type Validator<T> = (value: unknown) => T | undefined;

function emptyDocument(): LibraryDocument {
  return { version: 1, presets: [], jobs: [], remnants: [] };
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

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function finiteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return finitePositive(value) && Number.isInteger(value);
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
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
  if (!isRecord(value)
    || !validId(value.id)
    || !nonblankString(value.brand)
    || !nonblankString(value.productNumber)
    || !finitePositive(value.rollWidthMm)
    || !finitePositive(value.pieceWidthMm)
    || !finitePositive(value.pieceLengthMm)
    || !finiteNonnegative(value.gapMm)
    || !finiteNonnegative(value.sideMarginMm)
    || !finiteNonnegative(value.startEndMarginMm)
    || typeof value.allowRotation !== 'boolean'
    || !validTimestamp(value.createdAt)
    || !validTimestamp(value.updatedAt)) return undefined;
  return {
    id: value.id, brand: value.brand, productNumber: value.productNumber,
    rollWidthMm: value.rollWidthMm, pieceWidthMm: value.pieceWidthMm, pieceLengthMm: value.pieceLengthMm,
    gapMm: value.gapMm, sideMarginMm: value.sideMarginMm, startEndMarginMm: value.startEndMarginMm,
    allowRotation: value.allowRotation, createdAt: value.createdAt, updatedAt: value.updatedAt,
  };
}

function validateRemnant(value: unknown): FilmRemnant | undefined {
  if (!isRecord(value)
    || !validId(value.id)
    || !nonblankString(value.brand)
    || !nonblankString(value.productNumber)
    || !finitePositive(value.widthMm)
    || !finitePositive(value.lengthMm)
    || !positiveInteger(value.quantity)
    || !validTimestamp(value.createdAt)
    || !validTimestamp(value.updatedAt)
    || (value.note !== undefined && typeof value.note !== 'string')) return undefined;
  return {
    id: value.id, brand: value.brand, productNumber: value.productNumber,
    widthMm: value.widthMm, lengthMm: value.lengthMm, quantity: value.quantity,
    createdAt: value.createdAt, updatedAt: value.updatedAt,
    ...(value.note === undefined ? {} : { note: value.note }),
  };
}

function validateJob(value: unknown): SavedCuttingJob | undefined {
  if (!isRecord(value)
    || !validId(value.id)
    || !nonblankString(value.name)
    || !nonblankString(value.brand)
    || !nonblankString(value.productNumber)
    || !validTimestamp(value.createdAt)
    || !validTimestamp(value.updatedAt)
    || !Array.isArray(value.remnantIds)
    || !value.remnantIds.every(validId)
    || !Array.isArray(value.remnantSummary)) return undefined;
  const input = validateInput(value.input);
  const result = validateResult(value.result);
  const remnantSummary = value.remnantSummary.map(validateRemnantSummary);
  if (input === undefined || result === undefined || remnantSummary.some((item) => item === undefined)) return undefined;
  return {
    id: value.id, name: value.name, brand: value.brand, productNumber: value.productNumber,
    createdAt: value.createdAt, updatedAt: value.updatedAt, input,
    remnantIds: [...value.remnantIds], remnantSummary: remnantSummary as SavedRemnantSummary[], result,
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

function orderJobs(jobs: readonly SavedCuttingJob[]): SavedCuttingJob[] {
  return jobs
    .map(clone)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
    .slice(0, MAX_SAVED_JOBS);
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

/**
 * A single-process repository. Its promise queue prevents lost updates among
 * calls through this instance; separate instances need a stronger storage API.
 */
export function createLibraryRepository(adapter: KeyValueAdapter): LibraryRepository {
  let mutationQueue: Promise<void> = Promise.resolve();

  const read = async (): Promise<LibraryLoadResult> => {
    try {
      return parseDocument(await adapter.get(LIBRARY_STORAGE_KEY));
    } catch {
      return { document: emptyDocument(), warnings: ['Saved library could not be read and was reset.'] };
    }
  };

  const mutate = <T>(operation: (document: LibraryDocument) => T): Promise<T> => {
    const run = async (): Promise<T> => {
      const loaded = await read();
      const document = clone(loaded.document);
      const result = operation(document);
      await adapter.set(LIBRARY_STORAGE_KEY, JSON.stringify(document));
      return result;
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

    async renameJob(id, name, updatedAt): Promise<void> {
      assertId(id);
      if (!nonblankString(name)) throw new Error('Job name must be nonblank.');
      if (!validTimestamp(updatedAt)) throw new Error('Job updatedAt must be an ISO timestamp.');
      await mutate((document) => {
        document.jobs = orderJobs(document.jobs.map((job) => job.id === id
          ? { ...job, name, updatedAt }
          : clone(job)));
      });
    },

    async deleteJob(id): Promise<void> {
      assertId(id);
      await mutate((document) => {
        document.jobs = document.jobs.filter((job) => job.id !== id);
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
          const basedOn = delta.basedOnUpdatedAt[removeId];
          if (source === undefined || !validTimestamp(basedOn) || source.updatedAt !== basedOn) {
            throw new Error(`Inventory remnant "${removeId}" is missing or stale.`);
          }
        }
        if (Object.keys(delta.basedOnUpdatedAt).some((id) => !removeIds.has(id) || !validTimestamp(delta.basedOnUpdatedAt[id]))) {
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
      });
    },
  };
}
