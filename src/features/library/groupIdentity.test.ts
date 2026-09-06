import { describe, expect, it } from 'vitest';
import { updateGroupIdentity } from './groupIdentity';

describe('group identity updates', () => {
  it('updates the selected group and its pieces without changing other groups', () => {
    const groups = [
      { id: 'g1', mergeGroupId: 'auto', form: { brand: '영림', productNumber: '' }, pieces: [{ form: { brand: '영림', productNumber: '' } }] },
      { id: 'g2', mergeGroupId: undefined, form: { brand: '현대', productNumber: 'H1' }, pieces: [{ form: { brand: '현대', productNumber: 'H1' } }] },
    ];

    const next = updateGroupIdentity(groups, 'g1', { brand: 'LX', productNumber: 'L1' });

    expect(next[0]?.form).toEqual({ brand: 'LX', productNumber: 'L1' });
    expect(next[0]?.pieces[0]?.form).toEqual({ brand: 'LX', productNumber: 'L1' });
    expect(next[1]).toEqual(groups[1]);
  });

  it('keeps merged groups in sync while leaving disabled merges independent', () => {
    const groups = [
      { id: 'g1', mergeGroupId: '1', form: { brand: '영림', productNumber: '' }, pieces: [{ form: { brand: '영림', productNumber: '' } }] },
      { id: 'g2', mergeGroupId: '1', form: { brand: '영림', productNumber: '' }, pieces: [{ form: { brand: '영림', productNumber: '' } }] },
      { id: 'g3', mergeGroupId: '__disabled__', form: { brand: '영림', productNumber: '' }, pieces: [{ form: { brand: '영림', productNumber: '' } }] },
    ];

    const next = updateGroupIdentity(groups, 'g1', { productNumber: 'P-2' });

    expect(next.map((group) => group.form.productNumber)).toEqual(['P-2', 'P-2', '']);
    expect(next[1]?.pieces[0]?.form.productNumber).toBe('P-2');
  });
});
