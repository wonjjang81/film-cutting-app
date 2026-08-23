export type EstimatePanelVisibility = {
  showProjectSummary: boolean;
  showDetailSummary: boolean;
};

/** Keeps the estimate screen focused on one authoritative project total. */
export function getEstimatePanelVisibility(hasSavedJobs: boolean, hasDirectEstimate = false): EstimatePanelVisibility {
  return { showProjectSummary: hasSavedJobs || hasDirectEstimate, showDetailSummary: false };
}
