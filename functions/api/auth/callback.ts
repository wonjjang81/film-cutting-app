import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { CloudflareEnv, D1Database, PagesContext } from '../../_types';
import { AuthError, clearCookie, consumeOAuthAttempt, cookieValue, DEFAULT_TENANT_ID, normalizeEmail, OAUTH_BROWSER_COOKIE, randomToken, SESSION_COOKIE, sha256, selectBootstrapAction, secureCookie, validateGoogleClaims, type GoogleIdentity } from '../../_auth';
import { jsonResponse } from '../../_types';

type UserRow = { id: string; google_sub: string | null; email_norm: string; status: string };
type MembershipRow = { id: string; user_id: string | null; role: 'owner' | 'member'; status: string };

export async function resolveUser(db: D1Database, profile: GoogleIdentity, ownerEmail: string): Promise<{ userId: string; role: 'owner' | 'member' }> {
  const bySub = await db.prepare('SELECT id, google_sub, email_norm, status FROM users WHERE google_sub = ?1').bind(profile.subject).first<UserRow>();
  if (bySub) {
    if (bySub.status !== 'active') throw new AuthError(403, '사용이 중지된 계정입니다.');
    if (bySub.email_norm !== profile.email) {
      const collision = await db.prepare('SELECT id FROM users WHERE email_norm = ?1 AND id <> ?2').bind(profile.email, bySub.id).first<{ id: string }>();
      if (collision) throw new AuthError(409, 'Google 계정 이메일이 다른 사용자와 충돌합니다.');
      await db.prepare('UPDATE users SET email = ?1, email_norm = ?1, updated_at = ?2 WHERE id = ?3').bind(profile.email, new Date().toISOString(), bySub.id).run();
    }
    const membership = await activeMembership(db, bySub.id);
    return { userId: bySub.id, role: membership.role };
  }

  const existingEmail = await db.prepare('SELECT id, google_sub, email_norm, status FROM users WHERE email_norm = ?1').bind(profile.email).first<UserRow>();
  if (existingEmail?.status === 'disabled') throw new AuthError(403, '사용이 중지된 계정입니다.');
  if (existingEmail?.google_sub && existingEmail.google_sub !== profile.subject) throw new AuthError(409, '이 이메일은 이미 다른 Google 계정에 연결되어 있습니다.');
  if (existingEmail) {
    const membership = await db.prepare('SELECT role, status FROM memberships WHERE tenant_id = ?1 AND user_id = ?2')
      .bind(DEFAULT_TENANT_ID, existingEmail.id).first<{ role: 'owner' | 'member'; status: string }>();
    if (!membership || (membership.status !== 'active' && membership.status !== 'invited')) throw new AuthError(403, '사용이 중지되었거나 승인되지 않은 계정입니다.');
    if (membership.status === 'invited' && membership.role !== 'member') throw new AuthError(403, '승인되지 않은 계정입니다.');
    const now = new Date().toISOString();
    const statements = [db.prepare('UPDATE users SET google_sub = ?1, display_name = ?2, picture_url = ?3, updated_at = ?4 WHERE id = ?5 AND google_sub IS NULL')
      .bind(profile.subject, profile.name ?? null, profile.picture ?? null, now, existingEmail.id)];
    if (membership.status === 'invited') {
      statements.push(db.prepare(`UPDATE memberships SET status = 'active', updated_at = ?1
        WHERE tenant_id = ?2 AND user_id = ?3 AND role = 'member' AND status = 'invited'`)
        .bind(now, DEFAULT_TENANT_ID, existingEmail.id));
    }
    const results = await db.batch(statements);
    if (results.some((result) => (result.meta?.changes ?? 0) !== 1)) throw new AuthError(409, '계정 연결이 동시에 변경되었습니다. 다시 로그인해 주세요.');
    return { userId: existingEmail.id, role: membership.role };
  }

  const invitation = await db.prepare('SELECT id, user_id, role, status FROM memberships WHERE tenant_id = ?1 AND invited_email_norm = ?2').bind(DEFAULT_TENANT_ID, profile.email).first<MembershipRow>();
  const bootstrap = await db.prepare('SELECT owner_user_id FROM auth_bootstrap WHERE id = 1').first<{ owner_user_id: string }>();
  const legacy = await db.prepare('SELECT user_id FROM libraries WHERE lower(trim(user_email)) = ?1').bind(profile.email).all<{ user_id: string }>();
  const action = selectBootstrapAction({ email: profile.email, ownerEmail, matchingLegacyIds: legacy.results.map((row) => row.user_id), bootstrapOwnerId: bootstrap?.owner_user_id ?? null });
  if (action.kind === 'collision') throw new AuthError(409, '기존 프로젝트 계정이 중복되어 자동 연결할 수 없습니다.');
  const owner = action.kind === 'bind-owner' || action.kind === 'create-owner';
  if (!owner && (!invitation || invitation.status !== 'invited' || invitation.role !== 'member')) throw new AuthError(403, '관리자가 등록하지 않은 계정입니다.');
  const userId = action.kind === 'bind-owner' ? action.userId : legacy.results.length === 1 ? legacy.results[0]!.user_id : crypto.randomUUID();
  const now = new Date().toISOString();
  const role = owner ? 'owner' : 'member';
  const statements = [
    db.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO NOTHING').bind(DEFAULT_TENANT_ID, '필름 재단 작업공간', now),
    db.prepare('INSERT INTO users (id, google_sub, email, email_norm, display_name, picture_url, status, system_role, created_at, updated_at) VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8, ?8)').bind(userId, profile.subject, profile.email, profile.name ?? null, profile.picture ?? null, 'active', owner ? 'owner' : 'user', now),
  ];
  if (owner) {
    statements.push(db.prepare('INSERT INTO memberships (id, tenant_id, user_id, invited_email_norm, role, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)').bind(crypto.randomUUID(), DEFAULT_TENANT_ID, userId, profile.email, 'owner', 'active', now));
    statements.push(db.prepare('INSERT INTO auth_bootstrap (id, owner_user_id, owner_email_norm, created_at) VALUES (1, ?1, ?2, ?3)').bind(userId, profile.email, now));
  } else {
    statements.push(db.prepare('UPDATE memberships SET user_id = ?1, status = ?2, updated_at = ?3 WHERE id = ?4 AND user_id IS NULL AND status = ?5').bind(userId, 'active', now, invitation!.id, 'invited'));
  }
  try { await db.batch(statements); } catch { throw new AuthError(409, '계정 등록이 동시에 변경되었습니다. 다시 로그인해 주세요.'); }
  return { userId, role };
}

async function activeMembership(db: D1Database, userId: string): Promise<{ role: 'owner' | 'member' }> {
  const membership = await db.prepare('SELECT role, status FROM memberships WHERE tenant_id = ?1 AND user_id = ?2').bind(DEFAULT_TENANT_ID, userId).first<{ role: 'owner' | 'member'; status: string }>();
  if (!membership || membership.status !== 'active') throw new AuthError(403, '사용이 중지되었거나 승인되지 않은 계정입니다.');
  return { role: membership.role };
}

export async function onRequestGet({ request, env }: PagesContext<CloudflareEnv>): Promise<Response> {
  try {
    if (!env.DB || !env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.AUTH_REDIRECT_URI || !env.AUTH_OWNER_EMAIL) throw new AuthError(503, 'Google 로그인 설정이 완료되지 않았습니다.');
    const url = new URL(request.url);
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const browser = cookieValue(request, OAUTH_BROWSER_COOKIE);
    if (!state || !code || !browser) throw new AuthError(400, 'Google 로그인 응답이 올바르지 않습니다.');
    const attempt = await consumeOAuthAttempt(env.DB, await sha256(state), await sha256(browser), new Date().toISOString());
    if (!attempt) throw new AuthError(400, 'Google 로그인 요청이 만료되었거나 이미 사용되었습니다.');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, redirect_uri: env.AUTH_REDIRECT_URI, grant_type: 'authorization_code', code_verifier: attempt.pkce_verifier }) });
    if (!tokenResponse.ok) throw new AuthError(403, 'Google 인증 코드를 교환하지 못했습니다.');
    const tokens = await tokenResponse.json() as { id_token?: string };
    if (!tokens.id_token) throw new AuthError(403, 'Google ID 토큰이 없습니다.');
    const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
    const verified = await jwtVerify(tokens.id_token, keys, { algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: env.GOOGLE_OAUTH_CLIENT_ID });
    const profile = validateGoogleClaims(verified.payload as Record<string, unknown>, { clientId: env.GOOGLE_OAUTH_CLIENT_ID, nonce: attempt.nonce });
    const account = await resolveUser(env.DB, profile, normalizeEmail(env.AUTH_OWNER_EMAIL));
    const sessionToken = randomToken(48);
    const now = new Date();
    const absolute = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const idle = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO sessions (token_hash, user_id, tenant_id, absolute_expires_at, idle_expires_at, last_seen_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)').bind(await sha256(sessionToken), account.userId, DEFAULT_TENANT_ID, absolute.toISOString(), idle.toISOString(), now.toISOString()),
      env.DB.prepare('INSERT INTO audit_events (id, tenant_id, actor_user_id, event_type, target_id, metadata_json, created_at) VALUES (?1, ?2, ?3, ?4, ?3, ?5, ?6)').bind(crypto.randomUUID(), DEFAULT_TENANT_ID, account.userId, 'auth.login', '{}', now.toISOString()),
    ]);
    const headers = new Headers({ Location: attempt.return_to, 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', secureCookie(SESSION_COOKIE, sessionToken, 7 * 24 * 60 * 60));
    headers.append('Set-Cookie', clearCookie(OAUTH_BROWSER_COOKIE, '/api/auth'));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const authError = error instanceof AuthError ? error : new AuthError(500, 'Google 로그인을 완료하지 못했습니다.');
    return jsonResponse({ error: authError.message }, authError.status, { 'Cache-Control': 'no-store', 'Set-Cookie': clearCookie(OAUTH_BROWSER_COOKIE, '/api/auth') });
  }
}
