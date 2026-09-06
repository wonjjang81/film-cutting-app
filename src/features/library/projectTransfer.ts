import type { SavedCuttingJob, SavedMergedCuttingJob, SavedProject } from './models';

export const PROJECT_EXPORT_KIND = 'film-cutting-project' as const;
export const PROJECT_EXPORT_VERSION = 1 as const;

export type ProjectExportDocument = {
  kind: typeof PROJECT_EXPORT_KIND;
  version: typeof PROJECT_EXPORT_VERSION;
  exportedAt: string;
  project: SavedProject;
  jobs: SavedCuttingJob[];
  mergedJobs: SavedMergedCuttingJob[];
};

export function createProjectExport(
  project: SavedProject,
  jobs: readonly SavedCuttingJob[],
  mergedJobs: readonly SavedMergedCuttingJob[],
  exportedAt = new Date().toISOString(),
): ProjectExportDocument {
  return {
    kind: PROJECT_EXPORT_KIND,
    version: PROJECT_EXPORT_VERSION,
    exportedAt,
    project: structuredClone(project),
    jobs: structuredClone([...jobs]),
    mergedJobs: structuredClone([...mergedJobs]),
  };
}

export function serializeProjectExport(document: ProjectExportDocument): string {
  return JSON.stringify(document, null, 2);
}

export function parseProjectExport(raw: string): ProjectExportDocument {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('프로젝트 파일의 JSON 형식이 올바르지 않습니다.');
  }
  if (!isRecord(value) || value.kind !== PROJECT_EXPORT_KIND || value.version !== PROJECT_EXPORT_VERSION) {
    throw new Error('프로젝트 파일 형식이 아닙니다. 전체 백업은 백업 불러오기를 사용해 주세요.');
  }
  if (typeof value.exportedAt !== 'string' || !isRecord(value.project) || !Array.isArray(value.jobs) || !Array.isArray(value.mergedJobs)) {
    throw new Error('프로젝트 파일의 필수 데이터가 없습니다.');
  }
  return value as unknown as ProjectExportDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
