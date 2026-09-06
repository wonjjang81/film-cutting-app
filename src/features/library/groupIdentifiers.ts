export function normalizeGroupDisplayId(value: string | undefined, fallback: number): string {
  const normalized = value?.trim() ?? '';
  return /^\d+$/.test(normalized) ? normalized : String(Math.max(1, Math.trunc(fallback)));
}

export function validateGroupDisplayId(value: string, existingIds: readonly string[]): string | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return '대그룹 ID는 숫자로 입력해 주세요.';
  if (existingIds.some((id) => id.trim() === normalized)) return '대그룹 ID가 이미 사용 중입니다.';
  return null;
}
