import { describe, expect, it } from 'vitest';
import { dragAutoScrollStep } from './dragAutoScroll';

describe('dragAutoScrollStep', () => {
  it('keeps scrolling stopped while the dragged piece remains away from screen edges', () => {
    expect(dragAutoScrollStep(64, 800)).toBe(0);
    expect(dragAutoScrollStep(400, 800)).toBe(0);
    expect(dragAutoScrollStep(736, 800)).toBe(0);
  });

  it('scrolls only inside the narrow top and bottom edge zones', () => {
    expect(dragAutoScrollStep(30, 800)).toBe(-16);
    expect(dragAutoScrollStep(770, 800)).toBe(16);
  });

  it('does not scroll for invalid coordinates', () => {
    expect(dragAutoScrollStep(Number.NaN, 800)).toBe(0);
    expect(dragAutoScrollStep(30, 0)).toBe(0);
  });
});
