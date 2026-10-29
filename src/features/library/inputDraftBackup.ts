import type { CuttingFormState } from './uiWorkflowHelpers';
import type { ConstructionDifficulty } from '../estimate/difficultyPricing';

export type CuttingPieceDraft = { id: string; name: string; form: CuttingFormState };
export type EditableSubgroupOverallDimensions = { widthMm: string; heightMm: string; depthMm: string; doorCount: string };
export type CuttingSubgroupDraft = { id: string; name: string; pieceIds: string[]; expanded: boolean; difficulty: ConstructionDifficulty; siteCount: string; overallDimensions: EditableSubgroupOverallDimensions; diagramShapeKey?: string; installationPart?: string; constructionCostPerM?: number };
export type CuttingGroupDraft = { id: string; displayId: string; name: string; form: CuttingFormState; pieces: CuttingPieceDraft[]; subgroups: CuttingSubgroupDraft[]; mergeGroupId?: string; filmName: string; materialCostPerM: string; constructionCostPerM2: string; patternFixed: boolean };

export type InputDraftBackup = {
  version: 1; ownerId: string; updatedAt: string;
  projectId: string | null; projectName: string; groups: CuttingGroupDraft[];
  activeGroupId: string; activePieceId: string; useRemnants: boolean;
  diagramPart: string; diagramTargets: Record<string, string>;
};

const PREFIX = 'film-cutting-input-draft-v1:';
export function inputDraftActiveKey(owner: string): string { return `${PREFIX}${encodeURIComponent(owner)}:active`; }
export function inputDraftKey(owner: string, projectId: string | null): string {
  return `${PREFIX}${encodeURIComponent(owner)}:${projectId === null ? 'unsaved' : `project:${encodeURIComponent(projectId)}`}`;
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function validForm(value: unknown): value is CuttingFormState {
  return record(value) && ['brand', 'productNumber', 'rollWidth', 'pieceWidth', 'pieceLength', 'quantity', 'gap', 'sideMargin', 'startEndMargin'].every(key => typeof value[key] === 'string')
    && typeof value.allowRotation === 'boolean' && (value.cutAllowance === undefined || typeof value.cutAllowance === 'string')
    && (value.placementDeferred === undefined || typeof value.placementDeferred === 'boolean');
}
function validGroup(value: unknown): value is CuttingGroupDraft {
  if (!record(value) || !['id', 'displayId', 'name', 'filmName', 'materialCostPerM', 'constructionCostPerM2'].every(key => typeof value[key] === 'string') || !validForm(value.form) || typeof value.patternFixed !== 'boolean') return false;
  if (!Array.isArray(value.pieces) || !value.pieces.every(piece => record(piece) && typeof piece.id === 'string' && typeof piece.name === 'string' && validForm(piece.form))) return false;
  if (new Set(value.pieces.map(piece => piece.id)).size !== value.pieces.length) return false;
  return Array.isArray(value.subgroups) && value.subgroups.every(subgroup => record(subgroup) && typeof subgroup.id === 'string' && typeof subgroup.name === 'string'
    && typeof subgroup.siteCount === 'string' && typeof subgroup.expanded === 'boolean' && typeof subgroup.difficulty === 'string'
    && record(subgroup.overallDimensions) && ['widthMm', 'heightMm', 'depthMm', 'doorCount'].every(key => typeof (subgroup.overallDimensions as Record<string, unknown>)[key] === 'string')
    && Array.isArray(subgroup.pieceIds) && subgroup.pieceIds.every(id => typeof id === 'string' && (value.pieces as CuttingPieceDraft[]).some(piece => piece.id === id)));
}
export function parseInputDraftBackup(raw: string | null, ownerId: string, projectId?: string | null): InputDraftBackup | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== 1 || value.ownerId !== ownerId || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) return null;
    if (!(value.projectId === null || typeof value.projectId === 'string') || (projectId !== undefined && value.projectId !== projectId) || typeof value.projectName !== 'string') return null;
    if (!Array.isArray(value.groups) || value.groups.length === 0 || !value.groups.every(validGroup) || new Set(value.groups.map(group => group.id)).size !== value.groups.length) return null;
    if (typeof value.activeGroupId !== 'string' || typeof value.activePieceId !== 'string' || typeof value.useRemnants !== 'boolean' || typeof value.diagramPart !== 'string' || !record(value.diagramTargets) || !Object.values(value.diagramTargets).every(target => typeof target === 'string')) return null;
    return value as InputDraftBackup;
  } catch { return null; }
}
/** One current temporary draft and one latest minute backup per project. */
export function inputDraftWrites(draft: InputDraftBackup, backup = false): [string, string][] {
  const raw = JSON.stringify(draft);
  if (!parseInputDraftBackup(raw, draft.ownerId, draft.projectId)) throw new Error('입력 백업 데이터가 올바르지 않습니다. 기존 백업은 보존했습니다.');
  const key = inputDraftKey(draft.ownerId, draft.projectId);
  return backup ? [[`${key}:backup`, raw]] : [[key, raw], [inputDraftActiveKey(draft.ownerId), JSON.stringify({ projectId: draft.projectId })]];
}

export function parseActiveInputProject(raw: string | null): string | null | undefined {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    return record(value) && (value.projectId === null || typeof value.projectId === 'string') ? value.projectId : undefined;
  } catch { return undefined; }
}
