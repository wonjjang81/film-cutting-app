export type EstimatePanelVisibility = {
  showProjectSummary: boolean;
  showDetailSummary: boolean;
};

/** Keeps the estimate screen focused on one authoritative project total. */
export function getEstimatePanelVisibility(hasCurrentEstimate: boolean): EstimatePanelVisibility {
  return { showProjectSummary: hasCurrentEstimate, showDetailSummary: false };
}
