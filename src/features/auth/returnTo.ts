/**
 * 로그인 후 돌아갈 앱 내부 경로를 검증합니다.
 * 외부 주소(//evil.com), 역슬래시 경로, 로그인 화면 자신은 거부합니다.
 * 서버(functions/_auth.ts의 safeReturnTo)도 같은 규칙으로 다시 검증합니다.
 */
export function sanitizeReturnTo(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string' || candidate.length > 2048) return null;
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return null;
  const path = candidate.split(/[?#]/)[0] ?? '';
  if (path === '/' || path === '/login' || path.startsWith('/login/') || path.startsWith('/api/')) return null;
  return candidate;
}

export const DEFAULT_AFTER_LOGIN = '/input';
