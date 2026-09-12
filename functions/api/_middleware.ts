import type { CloudflareEnv, PagesContext } from '../_types';
import { AuthError, authorizeSessionRecord, cookieValue, DEFAULT_TENANT_ID, SESSION_COOKIE, sha256, type AuthIdentity, type SessionRecord } from '../_auth';
import { jsonResponse } from '../_types';

type SessionRow = SessionRecord & { tokenHash: string };

export async function onRequest(context: PagesContext<CloudflareEnv, { auth?: AuthIdentity }>): Promise<Response> {
  const { request, env } = context;
  const path = new URL(request.url).pathname;
  if (request.method === 'OPTIONS' || path === '/api/health' || path === '/api/auth/login' || path === '/api/auth/callback' || path === '/api/auth/logout') return context.next();
  try {
    if (!env.DB) throw new AuthError(503, '인증 데이터베이스가 설정되지 않았습니다.');
    if (!['GET', 'HEAD'].includes(request.method)) {
      const origin = request.headers.get('Origin');
      if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) throw new AuthError(403, '허용되지 않은 요청 출처입니다.');
    }
    const token = cookieValue(request, SESSION_COOKIE);
    if (!token) throw new AuthError(401, '로그인이 필요합니다.');
    const tokenHash = await sha256(token);
    const row = await env.DB.prepare(`SELECT s.token_hash AS tokenHash, s.user_id AS userId, s.tenant_id AS sessionTenantId,
      s.absolute_expires_at AS absoluteExpiresAt, s.idle_expires_at AS idleExpiresAt,
      u.email AS email, u.status AS userStatus, m.status AS membershipStatus,
      m.tenant_id AS tenantId, m.role AS role
      FROM sessions s JOIN users u ON u.id = s.user_id
      JOIN memberships m ON m.user_id = u.id AND m.tenant_id = s.tenant_id
      WHERE s.token_hash = ?1 AND s.tenant_id = ?2`).bind(tokenHash, DEFAULT_TENANT_ID).first<SessionRow>();
    if (!row) throw new AuthError(401, '로그인 세션이 없습니다.');
    const identity = authorizeSessionRecord(row);
    const now = new Date();
    const idle = new Date(Math.min(Date.parse(row.absoluteExpiresAt), now.getTime() + 24 * 60 * 60 * 1000)).toISOString();
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?1, idle_expires_at = ?2 WHERE token_hash = ?3').bind(now.toISOString(), idle, tokenHash).run();
    context.data.auth = identity;
    return context.next();
  } catch (error) {
    const authError = error instanceof AuthError ? error : new AuthError(500, '인증 상태를 확인하지 못했습니다.');
    return jsonResponse({ error: authError.message }, authError.status, { 'Cache-Control': 'no-store' });
  }
}
