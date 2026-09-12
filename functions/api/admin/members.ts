import { AuthError, normalizeEmail, requireOwner, type AuthIdentity } from '../../_auth';
import type { CloudflareEnv, PagesContext } from '../../_types';
import { jsonResponse } from '../../_types';

type MemberRow = { id: string; email: string; role: 'owner' | 'member'; status: string; createdAt: string };
type AuthData = { auth?: AuthIdentity };

export async function onRequestGet(context: PagesContext<CloudflareEnv, AuthData>): Promise<Response> {
  try {
    const identity = owner(context);
    const db = database(context);
    const result = await db.prepare(`SELECT u.id, u.email, m.role, m.status, m.created_at AS createdAt
      FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = ?1 ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, u.email`)
      .bind(identity.tenantId).all<MemberRow>();
    return jsonResponse({ members: result.results ?? [] }, 200, { 'Cache-Control': 'no-store' });
  } catch (error) { return failure(error); }
}

export async function onRequestPost(context: PagesContext<CloudflareEnv, AuthData>): Promise<Response> {
  try {
    const identity = owner(context);
    const db = database(context);
    const body = await context.request.json() as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    if (!email || !email.includes('@')) throw new AuthError(400, '올바른 이메일을 입력하세요.');
    if ('role' in body || 'tenantId' in body) throw new AuthError(400, '권한과 작업공간은 요청에서 지정할 수 없습니다.');
    const now = new Date().toISOString();
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first<{ id: string }>();
    const userId = existing?.id ?? crypto.randomUUID();
    await db.batch([
      db.prepare(`INSERT INTO users (id, email, status, system_role, created_at, updated_at)
        VALUES (?1, ?2, 'active', 'user', ?3, ?3) ON CONFLICT(email) DO UPDATE SET updated_at = excluded.updated_at`).bind(userId, email, now),
      db.prepare(`INSERT INTO memberships (tenant_id, user_id, role, status, created_at, updated_at)
        VALUES (?1, ?2, 'member', 'invited', ?3, ?3)
        ON CONFLICT(tenant_id, user_id) DO UPDATE SET status = CASE WHEN memberships.role = 'owner' THEN memberships.status ELSE 'invited' END, updated_at = excluded.updated_at`)
        .bind(identity.tenantId, userId, now),
      db.prepare(`INSERT INTO audit_events (id, tenant_id, actor_user_id, event_type, target_id, metadata_json, created_at)
        VALUES (?1, ?2, ?3, 'member.invited', ?4, ?5, ?6)`).bind(crypto.randomUUID(), identity.tenantId, identity.userId, userId, JSON.stringify({ email }), now),
    ]);
    return jsonResponse({ member: { id: userId, email, role: 'member', status: 'invited', createdAt: now } }, 201);
  } catch (error) { return failure(error); }
}

export async function onRequestPatch(context: PagesContext<CloudflareEnv, AuthData>): Promise<Response> {
  try {
    const identity = owner(context);
    const db = database(context);
    const body = await context.request.json() as Record<string, unknown>;
    if ('role' in body || 'tenantId' in body) throw new AuthError(400, '권한과 작업공간은 요청에서 변경할 수 없습니다.');
    const userId = typeof body.userId === 'string' ? body.userId : '';
    const status = body.status === 'active' || body.status === 'disabled' ? body.status : null;
    if (!userId || !status) throw new AuthError(400, '회원과 상태를 확인하세요.');
    const now = new Date().toISOString();
    const result = await db.prepare(`UPDATE memberships SET status = ?1, updated_at = ?2
      WHERE tenant_id = ?3 AND user_id = ?4 AND role = 'member'`).bind(status, now, identity.tenantId, userId).run();
    if (!result.meta?.changes) throw new AuthError(404, '변경할 일반 회원을 찾지 못했습니다.');
    const statements = [db.prepare(`INSERT INTO audit_events (id, tenant_id, actor_user_id, event_type, target_id, metadata_json, created_at)
      VALUES (?1, ?2, ?3, 'member.status_changed', ?4, ?5, ?6)`)
      .bind(crypto.randomUUID(), identity.tenantId, identity.userId, userId, JSON.stringify({ status }), now)];
    if (status === 'disabled') statements.push(db.prepare('DELETE FROM sessions WHERE tenant_id = ?1 AND user_id = ?2').bind(identity.tenantId, userId));
    await db.batch(statements);
    return jsonResponse({ ok: true, status });
  } catch (error) { return failure(error); }
}

function owner(context: PagesContext<CloudflareEnv, AuthData>): AuthIdentity {
  const identity = context.data.auth;
  if (!identity) throw new AuthError(401, '로그인이 필요합니다.');
  requireOwner(identity);
  return identity;
}

function database(context: PagesContext<CloudflareEnv, AuthData>) {
  if (!context.env.DB) throw new AuthError(503, '인증 데이터베이스가 설정되지 않았습니다.');
  return context.env.DB;
}

function failure(error: unknown): Response {
  const authError = error instanceof AuthError ? error : new AuthError(500, '회원 정보를 처리하지 못했습니다.');
  return jsonResponse({ error: authError.message }, authError.status, { 'Cache-Control': 'no-store' });
}
