import { describe, expect, it, vi } from 'vitest';

import {
  type FilmPreset,
  type FilmRemnant,
  type SavedCuttingJob,
  type SavedMergedCuttingJob,
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

function retryableReadAdapter(): KeyValueAdapter & {
  writes: number;
  rejectNextRead(): void;
} {
  let value: string | null = null;
  let writes = 0;
  let rejectRead = false;
  return {
    get: async () => {
      if (rejectRead) {
        rejectRead = false;
        throw new Error('storage unavailable');
      }
      return value;
    },
    set: async (_key, nextValue) => {
      writes += 1;
      value = nextValue;
    },
    get writes() {
      return writes;
    },
    rejectNextRead: () => {
      rejectRead = true;
    },
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

function mergedJob(index = 1, overrides: Partial<SavedMergedCuttingJob> = {}): SavedMergedCuttingJob {
  const savedAt = new Date(Date.UTC(2026, 0, 2, 0, 0, index)).toISOString();
  return {
    id: `merged-${index}`,
    name: `Merged ${index}`,
    mergeGroupId: 'merge-1',
    groupNames: ['그룹 1', '그룹 2'],
    sourceJobIds: ['job-1', 'job-2'],
    createdAt: savedAt,
    updatedAt: savedAt,
    rollWidthMm: 1220,
    usedLengthMm: 500,
    producedQuantity: 4,
    utilizationPercent: 78,
    wastePercent: 22,
    placements: [{ id: 1, sourceId: 'group-1-piece-1', instanceIndex: 0, x: 5, y: 5, width: 400, height: 100, rotated: false }],
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

    expect(corrupted.document).toEqual({ version: 1, presets: [], jobs: [], remnants: [], mergedJobs: [] });
    expect(corrupted.warnings[0]).toContain('corrupted');
    expect(unsupported.document).toEqual({ version: 1, presets: [], jobs: [], remnants: [], mergedJobs: [] });
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

  it('persists a whole group calculation in one storage mutation', async () => {
    const adapter = trackedAdapter();
    const repository = createLibraryRepository(adapter);

    await repository.saveBatchJobs([job(1), job(2)], [mergedJob()]);

    expect(adapter.writes).toBe(1);
    const loaded = await repository.load();
    expect(loaded.document.jobs.map((item) => item.id)).toEqual(['job-2', 'job-1']);
    expect(loaded.document.mergedJobs).toHaveLength(1);
  });

  it('replays a mutation once after an optimistic concurrency conflict', async () => {
    let value: string | null = null;
    let conflicts = 0;
    const adapter: KeyValueAdapter = {
      get: async () => value,
      set: async (_key, nextValue) => {
        if (conflicts === 0) {
          conflicts += 1;
          throw new Error('다른 기기에서 프로젝트가 변경되었습니다.');
        }
        value = nextValue;
      },
    };
    const repository = createLibraryRepository(adapter);

    await repository.saveJob(job(1));

    expect(conflicts).toBe(1);
    expect((await repository.load()).document.jobs).toHaveLength(1);
  });

  it('confirms multiple jobs in one inventory transaction and prevents a second confirmation', async () => {
    const repository = createLibraryRepository(memoryAdapter());
    const first = job(1, { id: 'batch-job-1' });
    const second = job(2, { id: 'batch-job-2' });
    await repository.saveJob(first);
    await repository.saveJob(second);

    await repository.confirmJobs([first, second], { removeIds: [], add: [], basedOnUpdatedAt: {} });

    const loaded = await repository.load();
    expect(loaded.document.jobs.find((item) => item.id === 'batch-job-1')).toMatchObject({ isInventoryConfirmed: true });
    expect(loaded.document.jobs.find((item) => item.id === 'batch-job-2')).toMatchObject({ isInventoryConfirmed: true });
    await expect(repository.confirmJobs([first, second], { removeIds: [], add: [], basedOnUpdatedAt: {} })).rejects.toThrow('이미 재고 확정');
  });

  it('saves and reloads a mixed-size merged roll as one production record', async () => {
    const repository = createLibraryRepository(memoryAdapter());
    await repository.saveMergedJob(mergedJob());

    const loaded = await repository.load();
    expect(loaded.document.mergedJobs).toHaveLength(1);
    expect(loaded.document.mergedJobs[0]).toMatchObject({
      id: 'merged-1',
      rollWidthMm: 1220,
      sourceJobIds: ['job-1', 'job-2'],
      placements: [{ sourceId: 'group-1-piece-1', width: 400 }],
    });
  });

  it('confirms a merged roll inventory delta atomically', async () => {
    const repository = createLibraryRepository(memoryAdapter());
    const source = remnant({ id: 'merged-remnant', widthMm: 180, lengthMm: 220 });
    const merged = mergedJob(1, { remnantIds: [source.id], remnantSummary: [{ id: source.id, widthMm: source.widthMm, lengthMm: source.lengthMm, quantity: 1 }] });
    await repository.saveRemnant(source);
    await repository.saveMergedJob(merged);

    await repository.confirmMergedJob(merged, { removeIds: [source.id], add: [], basedOnUpdatedAt: { [source.id]: source.updatedAt } });

    const loaded = await repository.load();
    expect(loaded.document.remnants).toEqual([]);
    expect(loaded.document.mergedJobs[0]).toMatchObject({ id: merged.id, isInventoryConfirmed: true });
    await expect(repository.confirmMergedJob(merged, { removeIds: [], add: [], basedOnUpdatedAt: {} })).rejects.toThrow('이미 재고 확정');
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

  it('does not overwrite existing storage when a mutation cannot read it', async () => {
    const adapter = retryableReadAdapter();
    const repository = createLibraryRepository(adapter);
    await repository.saveRemnant(remnant({ id: 'existing' }));
    const writesBeforeFailure = adapter.writes;
    adapter.rejectNextRead();

    await expect(repository.saveRemnant(remnant({ id: 'new' }))).rejects.toThrow('storage unavailable');

    expect(adapter.writes).toBe(writesBeforeFailure);
    expect((await repository.load()).document.remnants.map((item) => item.id)).toEqual(['existing']);
  });

  it('keeps the mutation queue usable after a read failure and preserves later updates', async () => {
    const adapter = retryableReadAdapter();
    const repository = createLibraryRepository(adapter);
    await repository.saveRemnant(remnant({ id: 'existing' }));
    adapter.rejectNextRead();

    await expect(repository.saveRemnant(remnant({ id: 'lost' }))).rejects.toThrow('storage unavailable');
    await repository.saveRemnant(remnant({ id: 'retained' }));

    expect((await repository.load()).document.remnants.map((item) => item.id)).toEqual(['existing', 'retained']);
  });

  it('does not rewrite a partially corrupt document during a mutation', async () => {
    const stored = JSON.stringify({
      version: 1,
      presets: [],
      jobs: [],
      remnants: [remnant(), { ...remnant({ id: 'bad' }), widthMm: 0 }],
    });
    const adapter = trackedAdapter(stored);
    const repository = createLibraryRepository(adapter);

    await expect(repository.saveRemnant(remnant({ id: 'new' }))).rejects.toThrow('must be recovered');

    expect(adapter.writes).toBe(0);
    expect(adapter.value()).toBe(stored);
  });

  it('normalizes valid ISO-8601 instants and accepts equivalent delta versions', async () => {
    const repository = createLibraryRepository(memoryAdapter());
    await repository.saveRemnant(remnant({
      id: 'source',
      createdAt: '2026-08-16T00:00:00Z',
      updatedAt: '2026-08-16T09:00:00+09:00',
    }));

    expect((await repository.load()).document.remnants[0]).toMatchObject({
      createdAt: '2026-08-16T00:00:00.000Z',
      updatedAt: '2026-08-16T00:00:00.000Z',
    });

    await repository.applyInventoryDelta({
      removeIds: ['source'],
      add: [remnant({ id: 'residual', widthMm: 20, lengthMm: 40 })],
      basedOnUpdatedAt: { source: '2026-08-16T00:00:00Z' },
    });

    expect((await repository.load()).document.remnants.map((item) => item.id)).toEqual(['residual']);
  });

  it('rejects date-only and locale timestamp strings', async () => {
    const repository = createLibraryRepository(memoryAdapter());

    await expect(repository.saveRemnant(remnant({ createdAt: '2026-08-16' }))).rejects.toThrow('Invalid remnant');
    await expect(repository.saveRemnant(remnant({ updatedAt: '8/16/2026, 9:00 AM' }))).rejects.toThrow('Invalid remnant');
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

  it('confirms a job and its inventory delta together in exactly one write', async () => {
    const adapter = trackedAdapter();
    const repository = createLibraryRepository(adapter);
    await repository.saveRemnant(remnant({ id: 'source' }));
    const writesBeforeConfirmation = adapter.writes;

    await repository.confirmJob(job(1), {
      removeIds: ['source'],
      add: [remnant({ id: 'residual', widthMm: 20, lengthMm: 40 })],
      basedOnUpdatedAt: { source: timestamp },
    });

    const confirmed = (await repository.load()).document;
    expect(adapter.writes).toBe(writesBeforeConfirmation + 1);
    expect(confirmed.jobs.map((item) => item.id)).toEqual(['job-1']);
    expect(confirmed.remnants).toEqual([
      expect.objectContaining({ id: 'residual', widthMm: 20, lengthMm: 40 }),
    ]);
  });

  it('does not save a job when its confirmation delta is stale', async () => {
    const adapter = trackedAdapter();
    const repository = createLibraryRepository(adapter);
    await repository.saveRemnant(remnant({ id: 'source' }));
    const writesBeforeConfirmation = adapter.writes;

    await expect(repository.confirmJob(job(1), {
      removeIds: ['source'],
      add: [],
      basedOnUpdatedAt: { source: '2026-08-16T00:00:01.000Z' },
    })).rejects.toThrow('stale');

    const unchanged = (await repository.load()).document;
    expect(adapter.writes).toBe(writesBeforeConfirmation);
    expect(unchanged.jobs).toEqual([]);
    expect(unchanged.remnants.map((item) => item.id)).toEqual(['source']);
  });

  it('does not apply inventory when the confirmed job is malformed', async () => {
    const adapter = trackedAdapter();
    const repository = createLibraryRepository(adapter);
    await repository.saveRemnant(remnant({ id: 'source' }));
    const writesBeforeConfirmation = adapter.writes;

    await expect(repository.confirmJob(job(1, { name: '  ' }), {
      removeIds: ['source'],
      add: [],
      basedOnUpdatedAt: { source: timestamp },
    })).rejects.toThrow('Invalid job');

    const unchanged = (await repository.load()).document;
    expect(adapter.writes).toBe(writesBeforeConfirmation);
    expect(unchanged.jobs).toEqual([]);
    expect(unchanged.remnants.map((item) => item.id)).toEqual(['source']);
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

  it('exports and imports a validated portable library document', async () => {
    const source = createLibraryRepository(memoryAdapter());
    await source.saveJob(job(1));
    const raw = await source.exportDocument();
    expect(JSON.parse(raw)).toMatchObject({ version: 1, jobs: [expect.objectContaining({ id: 'job-1' })] });

    const target = createLibraryRepository(memoryAdapter());
    await expect(target.importDocument(raw)).resolves.toEqual({ document: expect.objectContaining({ jobs: [expect.objectContaining({ id: 'job-1' })] }), warnings: [] });
    await expect(target.importDocument('{not json')).rejects.toThrow('가져오지 못했습니다');
  });
});
