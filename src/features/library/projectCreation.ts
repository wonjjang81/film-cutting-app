import type { SavedProject } from './models';
import { createUniqueUiId } from './uiWorkflowHelpers';

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
