import { describe, expect, it } from 'vitest';

import { planWithRemnants } from '../remnants/planWithRemnants';
import {
  buildSavedCuttingJob,
  createUniqueUiId,
  type CuttingFormState,
  toRemnantPlanRequest,
} from './uiWorkflowHelpers';

const timestamp = '2026-08-16T00:00:00.000Z';

const form: CuttingFormState = {
  brand: ' Film Co ',
  productNumber: ' FC-100 ',
  rollWidth: '100',
  pieceWidth: '60',
  pieceLength: '40',
  quantity: '2',
  gap: '0',
  sideMargin: '0',
  startEndMargin: '0',
  allowRotation: false,
};

const remnant = {
  id: 'remnant-a',
  brand: 'Film Co',
  productNumber: 'FC-100',
  widthMm: 60,
  lengthMm: 40,
  quantity: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('toRemnantPlanRequest', () => {
  it('trims the product identity and maps an unrestricted continuous-roll request', () => {
    expect(toRemnantPlanRequest(form, [remnant])).toEqual({
      brand: 'Film Co',
      productNumber: 'FC-100',
      rollWidthMm: 100,
      pieceWidthMm: 60,
      pieceLengthMm: 40,
      quantity: 2,
      gapMm: 0,
      sideMarginMm: 0,
      startEndMarginMm: 0,
      allowRotation: false,
      remnants: [remnant],
    });
  });

  it('rejects a blank brand before remnant lookup', () => {
    expect(() => toRemnantPlanRequest({ ...form, brand: '  ' }, [remnant])).toThrow('브랜드');
  });

  it('allows a blank product number for placement requests', () => {
    expect(toRemnantPlanRequest({ ...form, productNumber: '  ' }, [])).toMatchObject({ brand: 'Film Co', productNumber: '' });
  });
});

describe('createUniqueUiId', () => {
  it('adds the first free deterministic suffix to a timestamp-derived ID', () => {
    expect(createUniqueUiId('job', 1_723_766_400_000, [
      'job-1723766400000',
      'job-1723766400000-2',
      'another-id',
    ])).toBe('job-1723766400000-3');
  });
});

describe('buildSavedCuttingJob', () => {
  it('creates a structurally complete immutable summary across a remnant and new roll', () => {
    const request = toRemnantPlanRequest(form, [remnant]);
    const plan = planWithRemnants(request);
    const before = structuredClone({ request, plan, inventory: [remnant] });

    const job = buildSavedCuttingJob({
      id: 'job-1',
      name: 'Film Co FC-100 작업',
      createdAt: timestamp,
      request,
      plan,
      inventory: [remnant],
    });

    expect(job).toEqual({
      id: 'job-1',
      name: 'Film Co FC-100 작업',
      brand: 'Film Co',
      productNumber: 'FC-100',
      createdAt: timestamp,
      updatedAt: timestamp,
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
      remnantIds: ['remnant-a'],
      remnantSummary: [{ id: 'remnant-a', widthMm: 60, lengthMm: 40, quantity: 1 }],
      result: {
        newRollLengthMm: 40,
        producedQuantity: 2,
        overproduction: 0,
        utilizationPercent: 75,
        wastePercent: 25,
        optimizationStatus: 'exact',
      },
    });
    expect({ request, plan, inventory: [remnant] }).toEqual(before);
  });

  it('records zero new-roll length when remnants complete the job', () => {
    const request = toRemnantPlanRequest({ ...form, quantity: '1' }, [remnant]);
    const plan = planWithRemnants(request);

    expect(buildSavedCuttingJob({
      id: 'job-2', name: '자투리 작업', createdAt: timestamp, request, plan, inventory: [remnant],
    }).result).toMatchObject({ newRollLengthMm: 0, producedQuantity: 1, overproduction: 0 });
  });
});
