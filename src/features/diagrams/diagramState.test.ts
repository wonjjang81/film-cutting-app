import { describe, expect, it } from 'vitest';
import { diagramStorageKey, parseDiagramSelection, parseDiagramState, parseCabinetState } from './diagramState';
import { INSTALLATION_LABOR_REFERENCES } from '../estimate/installationLabor';
import { DIAGRAM_PARTS } from './diagramState';

const state = () => ({ version: 2, part: 'upper', next: 2, nextPreset: 1, selected: 1, sizes: { upper: { cols: 25, rows: 17 } }, drawings: { upper: [{ id: 1, role: 'top', name: '윗판', cells: [26, 27] }] }, presets: [] });
describe('construction diagram state boundary', () => {
  it('accepts stable preset-specific IDs without colliding across presets', () => {
    const selection = { id: 'P1-G07', shapeKey: 'preset:P1:7', part: '화장대', name: '몰딩', quantity: 1 };
    expect(parseDiagramSelection(selection)).toEqual(selection);
    expect(parseDiagramSelection({ ...selection, id: 'P2-G07' })).toBeNull();
    expect(parseDiagramSelection({ ...selection, part: 'unknown' })).toBeNull();
  });
  it('accepts only one or two pieces per diagram selection', () => {
    const selection = { id: 'U01', shapeKey: 'cabinet:U01', part: '싱크대 상부장', name: '양문장' };
    expect(parseDiagramSelection({ ...selection, quantity: 2 })?.quantity).toBe(2);
    expect(parseDiagramSelection({ ...selection, quantity: 1 })?.quantity).toBe(1);
    expect(parseDiagramSelection({ ...selection, quantity: 3 })).toBeNull();
    expect(parseDiagramSelection({ ...selection, quantity: '2' })).toBeNull();
  });
  it('accepts legacy cabinet and thin structural IDs independently of grid IDs', () => {
    expect(parseDiagramSelection({ id: 'U01', shapeKey: 'cabinet:U01', part: '싱크대 상부장', name: '양문장' })).not.toBeNull();
    expect(parseDiagramSelection({ id: 'U-MT', shapeKey: 'cabinet:U-MT', part: '싱크대 상부장', name: '몰딩' })).not.toBeNull();
    expect(parseDiagramSelection({ id: 'R01-BASE', shapeKey: 'cabinet:R01-BASE', part: '냉장고장', name: '밑판' })).not.toBeNull();
    expect(parseDiagramSelection({ id: 'R01', shapeKey: 'cabinet:R01', part: '싱크대 상부장', name: 'wrong' })).toBeNull();
  });
  it('validates cabinet save state and prevents duplicated IDs', () => {
    const cabinet = { id: 'U01', section: 'upper', kind: 'double', name: '상부장', width: 0, height: 0, qty: 2, a: 0, b: 0, allowance: 0, sites: 1 };
    const doc = { version: 4, parts: [cabinet], surfaces: [], view: 'upper', next: { upper: 2 }, selected: null, screen: 'diagram', query: '', queue: [] };
    expect(parseCabinetState(doc)).not.toBeNull();
    expect(parseCabinetState({ ...doc, illustrationGap: 8 })).not.toBeNull();
    expect(parseCabinetState({ ...doc, illustrationGap: -1 })).toBeNull();
    expect(parseCabinetState({ ...doc, illustrationGap: NaN })).toBeNull();
    expect(parseCabinetState({ ...doc, parts: [cabinet, cabinet] })).toBeNull();
    expect(parseCabinetState({ ...doc, parts: [{ ...cabinet, qty: NaN }] })).toBeNull();
  });
  it('round-trips expanded grids and new board roles', () => { expect(parseDiagramState(state())).toEqual(state()); });
  it('accepts fine grids and front panels without changing legacy preset dimensions', () => {
    const legacyPreset = { id: 'P1', part: 'upper', name: '기존', shapes: [{ id: 7, role: 'side', name: '옆판', cells: [0,24] }] };
    const fine = { ...state(), sizes: { upper: { cols: 128, rows: 128 } }, drawings: { upper: [{ id: 1, role: 'front', name: '앞판', cells: [16383] }] }, presets: [legacyPreset] };
    expect(parseDiagramState(fine)).toEqual(fine);
    expect(parseDiagramState({ ...fine, sizes: { upper: { cols: 129, rows: 128 } } })).toBeNull();
  });
  it('rejects overlaps, out-of-bounds cells and unsafe role/name/state inputs', () => {
    expect(parseDiagramState({ ...state(), drawings: { upper: [{ id: 1, role: 'top', name: '윗판', cells: [5000] }] } })).toBeNull();
    expect(parseDiagramState({ ...state(), drawings: { upper: [...state().drawings.upper, { id: 2, role: 'bottom', name: '밑판', cells: [26] }] } })).toBeNull();
    expect(parseDiagramState({ ...state(), part: '__proto__' })).toBeNull();
    expect(parseDiagramState({ ...state(), sizes: { upper: { cols: 1000, rows: 16 } } })).toBeNull();
  });
  it('accepts legacy dimensions and validates each preset independently', () => {
    expect(parseDiagramState({ ...state(), version: 1, sizes: undefined })).not.toBeNull();
    expect(parseDiagramState({ ...state(), presets: [{ id: 'P1', part: 'upper', name: '형태', size: { cols: 25, rows: 17 }, shapes: state().drawings.upper }] })).not.toBeNull();
  });
  it('uses the labor part list and scopes local storage by account', () => {
    expect(Object.values(DIAGRAM_PARTS).sort()).toEqual(INSTALLATION_LABOR_REFERENCES.map(p => p.name).sort());
    expect(diagramStorageKey('a')).not.toBe(diagramStorageKey('b'));
  });
  it('accepts matching IDs and rejects mismatched/forged selections', () => {
    expect(parseDiagramSelection({ id: 'G01', shapeKey: 'upper:1', part: '싱크대 상부장', name: '상부장' })).not.toBeNull();
    expect(parseDiagramSelection({ id: 'G02', shapeKey: 'upper:1', part: '싱크대 상부장', name: '상부장' })).toBeNull();
    expect(parseDiagramSelection({ id: 'G01', shapeKey: 'upper:1', part: '냉장고장', name: '상부장' })).toBeNull();
  });
});
