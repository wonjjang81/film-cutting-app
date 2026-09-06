import type { SavedProject } from './models';
import { createUniqueUiId } from './uiWorkflowHelpers';
import type { CurrentEstimateSnapshot } from '../estimate/currentGroupEstimate';
import { calculateCurrentGroupEstimate } from '../estimate/currentGroupEstimate';

/** Creates the persisted header used when a project is started before its first calculation. */
export function createEmptyProject(name: string, createdAt: string, existingIds: readonly string[]): SavedProject {
  const trimmedName = name.trim();
  if (trimmedName.length === 0) throw new Error('프로젝트 이름을 입력해 주세요.');
  const timestampMs = Date.parse(createdAt);
  if (!Number.isFinite(timestampMs)) throw new Error('프로젝트 생성 시간이 올바르지 않습니다.');
  return {
    id: createUniqueUiId('project', timestampMs, existingIds),
    name: trimmedName,
    jobIds: [],
    mergedJobIds: [],
    materialCostPerM: 10_000,
    constructionCostPerM2: 15_000,
    createdAt,
    updatedAt: createdAt,
  };
}

export function createProjectFromCurrentEstimate(name: string, snapshot: CurrentEstimateSnapshot, createdAt: string, existingIds: readonly string[]) {
  const project = createEmptyProject(name, createdAt, existingIds);
  const estimate = calculateCurrentGroupEstimate(snapshot);
  return {
    project: { ...project, jobIds: estimate.jobs.map((job) => job.id), mergedJobIds: estimate.mergedJobs.map((job) => job.id) },
    jobs: estimate.jobs,
    mergedJobs: estimate.mergedJobs,
  };
}
