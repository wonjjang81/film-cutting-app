import { describe, expect, it, vi } from 'vitest';
import { runPlacementPopupAction } from './placementPopupAction';

describe('runPlacementPopupAction', () => {
  it('runs the button action before closing the piece information popup', () => {
    const order: string[] = [];

    runPlacementPopupAction(
      () => order.push('action'),
      () => order.push('close'),
    );

    expect(order).toEqual(['action', 'close']);
  });

  it('keeps the popup open when the button action throws', () => {
    const close = vi.fn();

    expect(() => runPlacementPopupAction(() => { throw new Error('failed'); }, close)).toThrow('failed');
    expect(close).not.toHaveBeenCalled();
  });
});
