import { describe, expect, it } from 'vitest';
import { diagramStorageKey, parseDiagramSelection, parseDiagramState } from './diagramState';
import { INSTALLATION_LABOR_REFERENCES } from '../estimate/installationLabor';
import { DIAGRAM_PARTS } from './diagramState';

const state = () => ({ version: 2, part: 'upper', next: 2, nextPreset: 1, selected: 1, sizes: { upper: { cols: 25, rows: 17 } }, drawings: { upper: [{ id: 1, role: 'top', name: '윗판', cells: [26, 27] }] }, presets: [] });
describe('construction diagram state boundary', () => {
  it('round-trips expanded grids and new board roles', () => { expect(parseDiagramState(state())).toEqual(state()); });
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
