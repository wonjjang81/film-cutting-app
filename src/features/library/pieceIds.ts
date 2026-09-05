export type PieceIdEntry = { id: string };

/** Legacy-compatible default ID: group name plus a two-digit sequence. */
export function defaultPieceId(groupName: string, index: number): string {
  return `${groupName}_${String(Math.max(1, index)).padStart(2, '0')}`;
}

/**
 * Generates the next ID using the legacy app's suffix rules. Custom IDs are
 * preserved; only the last numeric suffix is incremented.
 */
export function nextPieceId(pieces: readonly PieceIdEntry[], groupName: string): string {
  if (pieces.length === 0) return defaultPieceId(groupName, 1);
  const lastId = pieces.at(-1)?.id.trim() ?? '';
  const match = lastId.match(/^(.+?)[-_](\d+)$/);
  if (match) {
    const prefix = match[1]!.trim() || groupName;
    const next = Number(match[2]) + 1;
    if (prefix === groupName && match[0]!.includes('_')) return defaultPieceId(groupName, next);
    return `${prefix}-${String(next).padStart(2, '0')}`;
  }
  return `${lastId || groupName}-01`;
}

export function validatePieceId(pieces: readonly PieceIdEntry[], currentId: string, value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return '조각 이름을 입력해 주세요.';
  if (pieces.some((piece) => piece.id === normalized && piece.id !== currentId)) return '같은 그룹에 이미 사용 중인 조각 이름입니다.';
  return null;
}

