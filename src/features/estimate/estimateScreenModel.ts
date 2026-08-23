import type { SavedCuttingJob, SavedMergedCuttingJob } from '../library/models';

export type EstimatePanelVisibility = {
  showProjectSummary: boolean;
  showDetailSummary: boolean;
};

export type EstimateSourceMode = 'project' | 'current';
export type EstimateSourceSelection = { jobs: SavedCuttingJob[]; mergedJobs: SavedMergedCuttingJob[]; source: EstimateSourceMode };

/** Restores the legacy project-wide source while retaining unsaved current-input estimates. */
export function selectEstimateSource(
  mode: EstimateSourceMode,
  projectJobs: readonly SavedCuttingJob[],
  projectMergedJobs: readonly SavedMergedCuttingJob[],
  currentJobs: readonly SavedCuttingJob[],
  currentMergedJobs: readonly SavedMergedCuttingJob[],
): EstimateSourceSelection {
  if (mode === 'project' && projectJobs.length > 0) return { jobs: [...projectJobs], mergedJobs: [...projectMergedJobs], source: 'project' };
  return { jobs: [...currentJobs], mergedJobs: [...currentMergedJobs], source: 'current' };
}

/** Keeps the estimate screen focused on one authoritative project total. */
export function getEstimatePanelVisibility(hasCurrentEstimate: boolean): EstimatePanelVisibility {
  return { showProjectSummary: hasCurrentEstimate, showDetailSummary: false };
}
