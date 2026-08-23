import { describe, expect, it } from 'vitest';

import { getEstimatePanelVisibility } from './estimateScreenModel';

describe('getEstimatePanelVisibility', () => {
  it('shows one authoritative total instead of duplicating the same material cost in a detail card', () => {
    expect(getEstimatePanelVisibility(true)).toEqual({ showProjectSummary: true, showDetailSummary: false });
  });
});
