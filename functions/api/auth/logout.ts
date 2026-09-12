import { clearCookie, cookieValue, SESSION_COOKIE, sha256 } from '../../_auth';
import type { CloudflareEnv, PagesContext } from '../../_types';
import { jsonResponse } from '../../_types';

export async function onRequestPost({ request, env }: PagesContext<CloudflareEnv>): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return jsonResponse({ error: '허용되지 않은 요청 출처입니다.' }, 403, { 'Cache-Control': 'no-store' });
  const token = cookieValue(request, SESSION_COOKIE);
  if (token && env.DB) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256(token)).run();
  return jsonResponse({ ok: true }, 200, { 'Cache-Control': 'no-store', 'Set-Cookie': clearCookie(SESSION_COOKIE) });
}
