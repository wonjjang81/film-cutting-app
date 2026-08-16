import { describe, expect, it, vi } from 'vitest';

import {
  type FilmPreset,
  type FilmRemnant,
  type SavedCuttingJob,
} from './models';
import { createLibraryRepository, type KeyValueAdapter } from './libraryRepository';

const asyncStorage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: asyncStorage }));

const timestamp = '2026-08-16T00:00:00.000Z';

function memoryAdapter(): KeyValueAdapter {
  let value: string | null = null;
  return {
    get: async () => value,
    set: async (_key, nextValue) => {
      value = nextValue;
    },
  };
}

function trackedAdapter(initial: string | null = null): KeyValueAdapter & { writes: number; value: () => string | null } {
  let value = initial;
  let writes = 0;
  return {
    get: async () => value,
    set: async (_key, nextValue) => {
      writes += 1;
      value = nextValue;
    },
    get writes() {
      return writes;
    },
    value: () => value,
  };
}

function remnant(overrides: Partial<FilmRemnant> = {}): FilmRemnant {
  return {
    id: 'remnant-1',
    brand: 'A',
    productNumber: 'P1',
    widthMm: 60,
    lengthMm: 40,
    quantity: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function preset(overrides: Partial<FilmPreset> = {}): FilmPreset {
  return {
    id: 'preset-1',
    brand: 'A',
    productNumber: 'P1',
    rollWidthMm: 100,
    pieceWidthMm: 60,
    pieceLengthMm: 40,
    gapMm: 1,
    sideMarginMm: 2,
    startEndMarginMm: 3,
    allowRotation: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function job(index: number, overrides: Partial<SavedCuttingJob> = {}): SavedCuttingJob {
  const savedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
  return {
    id: `job-${index}`,
    name: `Job ${index}`,
    brand: 'A',
    productNumber: 'P1',
    createdAt: savedAt,
    updatedAt: savedAt,
    input: {
      rollWidthMm: 100,
      pieceWidthMm: 60,
      pieceLengthMm: 40,
      quantity: 2,
      gapMm: 0,
      sideMarginMm: 0,
      startEndMarginMm: 0,
      allowRotation: false,
    },
    remnantIds: ['remnant-1'],
    remnantSummary: [{ id: 'remnant-1', widthMm: 60, lengthMm: 40, quantity: 1 }],
    result: {
      newRollLengthMm: 80,
      producedQuantity: 2,
      overproduction: 0,
      utilizationPercent: 60,
      wastePercent: 40,
      optimizationStatus: 'exact',
    },
    ...overrides,
  };
}

describe('library repository', () => {
  it('saves and reloads a branded remnant at its exact size', async () => {
    const repository = createLibraryRepository(memoryAdapter());

    await repository.saveRemnant(remnant({ widthMm: 83, lengthMm: 217 }));

    expect((await repository.load()).document.remnants[0]).toMatchObject({
      widthMm: 83,
      lengthMm: 217,
    });
  });

  it('returns warnings and recovers the valid records from corrupt storage', async () => {
    const stored = JSON.stringify({
      version: 1,
      presets: [preset(), { ...preset({ id: 'bad' }), rollWidthMm: 0 }],
      jobs: 'not an array',
      remnants: [remnant(), { ...remnant({ id: 'bad-remnant' }), updatedAt: 'not-a-date' }],
    });

    const loaded = await createLibraryRepository(trackedAdapter(stored)).load();

    expect(loaded.document.presets.map((item) => item.id)).toEqual(['preset-1']);
    expect(loaded.document.jobs).toEqual([]);
    expect(loaded.document.remnants.map((item) => item.id)).toEqual(['remnant-1']);
    expect(loaded.warnings).toHaveLength(3);
  });

  it('resets malformed JSON and an unsupported version without throwing', async () => {
    const corrupted = await createLibraryRepository(trackedAdapter('{not json')).load();
    const unsupported = await createLibraryRepository(trackedAdapter(JSON.stringify({ version: 2 }))).load();

    expect(corrupted.document).toEqual({ version: 1, presets: [], jobs: [], remnants: [] });
    expect(corrupted.warnings[0]).toContain('corrupted');
    expect(unsupported.document).toEqual({ version: 1, presets: [], jobs: [], remnants: [] });
    expect(unsupported.warnings[0]).toContain('unsupported');
  });

  it('replaces a duplicate remnant ID instead of adding a second inventory record', async () => {
    const repository = createLibraryRepository(memoryAdapter());
    await repository.saveRemnant(remnant({ widthMm: 60 }));
    await repository.saveRemnant(remnant({ widthMm: 83, lengthMm: 217 }));

    const remnants = (await repository.load()).document.remnants;
    expect(remnants).toEqual([expect.objectContaining({ id: 'remnant-1', widthMm: 83, lengthMm: 217 })]);
  });

  it('isolates stored and returned documents from caller mutations', async () => {
    const repository = createLibraryRepository(memoryAdapter());
    const supplied = remnant();
    await repository.saveRemnant(supplied);
    supplied.widthMm = 999;

    const first = await repository.load();
    first.document.remnants[0]!.widthMm = 777;
    const second = await repository.load();

    expect(second.document.remnants[0]!.widthMm).toBe(60);
  });

  it('keeps only the 20 newest saved jobs', async () => {
    const repository = createLibraryRepository(memoryAdapter());
    for (let index = 1; index <= 21; index += 1) {
      await repository.saveJob(job(index));
    }

    const jobs = (await repository.load()).document.jobs;
    expect(jobs).toHaveLength(20);
    expect(jobs[0]!.id).toBe('job-21');
    expect(jobs.at(-1)!.id).toBe('job-2');
  });

  it('renames and deletes a saved job while rejecting a blank name', async () => {
    const repository = createLibraryRepository(memoryAdapter());
    await repository.saveJob(job(1));
    await repository.renameJob('job-1', 'Trim run', '2026-01-01T00:01:00.000Z');

    expect((await repository.load()).document.jobs[0]).toMatchObject({ name: 'Trim run' });
    await expect(repository.renameJob('job-1', '  ', '2026-01-01T00:02:00.000Z')).rejects.toThrow('nonblank');
    await repository.deleteJob('job-1');
    await repository.deleteJob('missing');
    expect((await repository.load()).document.jobs).toEqual([]);
  });

  it('serializes concurrent read-modify-write saves in one repository instance', async () => {
    const repository = createLibraryRepository(memoryAdapter());
    await Promise.all([
      repository.savePreset(preset({ id: 'first' })),
      repository.savePreset(preset({ id: 'second' })),
    ]);

    expect((await repository.load()).document.presets.map((item) => item.id)).toEqual(['first', 'second']);
  });

  it('rejects stale inventory before writing anything', async () => {
    const adapter = trackedAdapter();
    const repository = createLibraryRepository(adapter);
    await repository.saveRemnant(remnant({ id: 'source', updatedAt: timestamp }));
    const writesBeforeDelta = adapter.writes;

    await expect(repository.applyInventoryDelta({
      removeIds: ['source'],
      add: [remnant({ id: 'residual', widthMm: 20, lengthMm: 40 })],
      basedOnUpdatedAt: { source: '2026-08-16T00:00:01.000Z' },
    })).rejects.toThrow('stale');

    expect(adapter.writes).toBe(writesBeforeDelta);
    expect((await repository.load()).document.remnants.map((item) => item.id)).toEqual(['source']);
  });

  it('applies a fully validated inventory delta in exactly one write', async () => {
    const adapter = trackedAdapter();
    const repository = createLibraryRepository(adapter);
    await repository.saveRemnant(remnant({ id: 'source' }));
    const writesBeforeDelta = adapter.writes;

    await repository.applyInventoryDelta({
      removeIds: ['source'],
      add: [remnant({ id: 'residual', widthMm: 20, lengthMm: 40 })],
      basedOnUpdatedAt: { source: timestamp },
    });

    expect(adapter.writes).toBe(writesBeforeDelta + 1);
    expect((await repository.load()).document.remnants).toEqual([
      expect.objectContaining({ id: 'residual', widthMm: 20, lengthMm: 40 }),
    ]);
  });

  it('allows a timestamp-checked partial carry-forward to replace its own source ID', async () => {
    const repository = createLibraryRepository(memoryAdapter());
    await repository.saveRemnant(remnant({ id: 'source', quantity: 3 }));

    await repository.applyInventoryDelta({
      removeIds: ['source'],
      add: [remnant({ id: 'source', quantity: 2 })],
      basedOnUpdatedAt: { source: timestamp },
    });

    expect((await repository.load()).document.remnants).toEqual([
      expect.objectContaining({ id: 'source', quantity: 2 }),
    ]);
  });

  it('rejects an inventory addition that collides with an untouched remnant without writing', async () => {
    const adapter = trackedAdapter();
    const repository = createLibraryRepository(adapter);
    await repository.saveRemnant(remnant({ id: 'source' }));
    await repository.saveRemnant(remnant({ id: 'untouched' }));
    const writesBeforeDelta = adapter.writes;

    await expect(repository.applyInventoryDelta({
      removeIds: ['source'],
      add: [remnant({ id: 'untouched' })],
      basedOnUpdatedAt: { source: timestamp },
    })).rejects.toThrow('untouched');

    expect(adapter.writes).toBe(writesBeforeDelta);
  });

  it('rejects a malformed residual before writing any part of an inventory delta', async () => {
    const adapter = trackedAdapter();
    const repository = createLibraryRepository(adapter);
    await repository.saveRemnant(remnant({ id: 'source' }));
    const writesBeforeDelta = adapter.writes;

    await expect(repository.applyInventoryDelta({
      removeIds: ['source'],
      add: [remnant({ id: 'residual', widthMm: 0 })],
      basedOnUpdatedAt: { source: timestamp },
    })).rejects.toThrow('Invalid inventory remnant');

    expect(adapter.writes).toBe(writesBeforeDelta);
    expect((await repository.load()).document.remnants.map((item) => item.id)).toEqual(['source']);
  });

  it('forwards AsyncStorage calls through the two-method adapter seam', async () => {
    const { asyncStorageLibraryAdapter } = await import('./asyncStorageLibraryAdapter');
    asyncStorage.getItem.mockResolvedValueOnce('stored');

    await expect(asyncStorageLibraryAdapter.get('key')).resolves.toBe('stored');
    await asyncStorageLibraryAdapter.set('key', 'value');

    expect(asyncStorage.getItem).toHaveBeenCalledWith('key');
    expect(asyncStorage.setItem).toHaveBeenCalledWith('key', 'value');
  });
});
