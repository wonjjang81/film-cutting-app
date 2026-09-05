import { describe, expect, it } from 'vitest';
import { defaultPieceId, nextPieceId, validatePieceId } from './pieceIds';

describe('legacy piece IDs', () => {
  it('creates group-based two digit IDs', () => {
    expect(defaultPieceId('그룹 1', 1)).toBe('그룹 1_01');
    expect(defaultPieceId('그룹 1', 3)).toBe('그룹 1_03');
  });

  it('increments a numeric suffix and supports custom IDs', () => {
    expect(nextPieceId([{ id: '그룹 1_01' }], '그룹 1')).toBe('그룹 1_02');
    expect(nextPieceId([{ id: '창고-A' }], '그룹 1')).toBe('창고-A-01');
    expect(nextPieceId([], '그룹 1')).toBe('그룹 1_01');
  });

  it('rejects blank and duplicate IDs only within the current group', () => {
    const pieces = [{ id: 'A_01' }, { id: 'A_02' }];
    expect(validatePieceId(pieces, 'A_01', '   ')).toContain('입력');
    expect(validatePieceId(pieces, 'A_01', 'A_02')).toContain('이미');
    expect(validatePieceId(pieces, 'A_01', 'B_01')).toBeNull();
  });
});
