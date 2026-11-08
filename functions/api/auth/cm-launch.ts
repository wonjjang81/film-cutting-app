import { clearCookie, DEFAULT_TENANT_ID, OAUTH_BROWSER_COOKIE, normalizeEmail, randomToken, safeReturnTo, secureCookie, SESSION_COOKIE, sha256 } from '../../_auth';
import type { CloudflareEnv, PagesContext } from '../../_types';

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  cookies.forEach(cookie => headers.append('Set-Cookie', cookie));
  return new Response(null, { status: 302, headers });
}

/**
 * 건설매니저 '프로그램' 화면에서 연 경우: 1회용 코드를 건설매니저에 확인하고,
 * 같은 이메일의 기존 활성 계정이면 로그인시킵니다. 계정을 새로 만들지는 않습니다.
 */
export async function onRequestGet({ request, env }: PagesContext<CloudflareEnv>): Promise<Response> {
  const url = new URL(request.url);
  const next = safeReturnTo(url.searchParams.get('next'));
  const fail = (reason: string) => {
    const target = new URL(next, url.origin);
    target.searchParams.set('cmLaunchError', reason);
    return redirect(`${target.pathname}${target.search}`);
  };
  const code = url.searchParams.get('code') ?? '';
  if (!/^[a-f0-9]{64}$/.test(code)) return fail('invalid_code');
  if (!env.DB || !env.CONSTRUCTION_MANAGER_ORIGIN || !env.CONSTRUCTION_MANAGER_SERVICE_TOKEN) return fail('not_configured');
  const response = await fetch(`${env.CONSTRUCTION_MANAGER_ORIGIN.replace(/\/$/, '')}/api/integrations/v1/launch-codes/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CONSTRUCTION_MANAGER_SERVICE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }).catch(() => null);
  if (!response?.ok) return fail('verify_failed');
  const verified = await response.json().catch(() => null) as { email?: unknown } | null;
  const email = normalizeEmail(verified?.email);
  if (!email) return fail('verify_failed');
  const account = await env.DB.prepare(`SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ?1
    WHERE u.email_norm = ?2 AND u.status = 'active' AND m.status = 'active'`).bind(DEFAULT_TENANT_ID, email).first<{ id: string }>();
  if (!account) return fail('no_account');
  const sessionToken = randomToken(48);
  const now = new Date();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, tenant_id, absolute_expires_at, idle_expires_at, last_seen_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)')
      .bind(await sha256(sessionToken), account.id, DEFAULT_TENANT_ID, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), now.toISOString()),
    env.DB.prepare('INSERT INTO audit_events (id, tenant_id, actor_user_id, event_type, target_id, metadata_json, created_at) VALUES (?1, ?2, ?3, ?4, ?3, ?5, ?6)')
      .bind(crypto.randomUUID(), DEFAULT_TENANT_ID, account.id, 'auth.login', JSON.stringify({ via: 'construction-manager' }), now.toISOString()),
  ]);
  return redirect(next, [secureCookie(SESSION_COOKIE, sessionToken, 7 * 24 * 60 * 60), clearCookie(OAUTH_BROWSER_COOKIE, '/api/auth')]);
}
