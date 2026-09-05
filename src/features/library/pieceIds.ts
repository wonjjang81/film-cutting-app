export type PieceIdEntry = { id: string };

/** Legacy-compatible default ID: group name plus a two-digit sequence. */
export function defaultPieceId(groupName: string, index: number): string {
  return `${groupName}_${String(Math.max(1, index)).padStart(2, '0')}`;
}

/** Returns only the editable part after the fixed group-name prefix. */
export function pieceNamePart(groupName: string, pieceId: string): string {
  const normalizedGroup = groupName.trim();
  const normalizedPiece = pieceId.trim();
  for (const separator of ['_', '-']) {
    const prefix = `${normalizedGroup}${separator}`;
    if (normalizedPiece.startsWith(prefix)) return normalizedPiece.slice(prefix.length) || '01';
  }
  // Legacy/custom IDs have no reliable delimiter. Preserve the full value
  // instead of truncating a legitimate piece name such as "좌측-상단".
  return normalizedPiece || '01';
}

/** Combines the immutable group name and the operator-editable piece name. */
export function composePieceId(groupName: string, pieceName: string): string {
  const normalizedGroup = groupName.trim();
  const normalizedPiece = pieceName.trim();
  if (!normalizedGroup || !normalizedPiece) throw new Error('그룹명과 조각 이름을 입력해 주세요.');
  return `${normalizedGroup}_${normalizedPiece}`;
}

/**
 * Generates the next ID using the legacy app's suffix rules. Custom IDs are
 * preserved; only the last numeric suffix is incremented.
 */
export function nextPieceId(pieces: readonly PieceIdEntry[], groupName: string): string {
  if (pieces.length === 0) return defaultPieceId(groupName, 1);
  const groupPrefix = `${groupName}_`;
  const defaultIndexes = pieces
    .map((piece) => piece.id.trim())
    .filter((id) => id.startsWith(groupPrefix))
    .map((id) => Number(id.slice(groupPrefix.length)))
    .filter((index) => Number.isInteger(index) && index > 0);
  if (defaultIndexes.length > 0) return defaultPieceId(groupName, Math.max(...defaultIndexes) + 1);
  const lastId = pieces.at(-1)?.id.trim() ?? '';
  const match = lastId.match(/^(.+?)[-_](\d+)$/);
  if (match) {
    const prefix = match[1]!.trim() || groupName;
    const next = Number(match[2]) + 1;
    if (prefix === groupName) return defaultPieceId(groupName, next);
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

