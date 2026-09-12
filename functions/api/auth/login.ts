import type { CloudflareEnv, PagesContext } from '../../_types';
import { AuthError, OAUTH_BROWSER_COOKIE, randomToken, safeReturnTo, secureCookie, sha256 } from '../../_auth';
import { jsonResponse } from '../../_types';

export async function onRequestGet({ request, env }: PagesContext<CloudflareEnv>): Promise<Response> {
  try {
    if (!env.DB || !env.GOOGLE_OAUTH_CLIENT_ID || !env.AUTH_REDIRECT_URI) throw new AuthError(503, 'Google 로그인 설정이 완료되지 않았습니다.');
    const url = new URL(request.url);
    const state = randomToken();
    const nonce = randomToken();
    const verifier = randomToken(48);
    const browser = randomToken();
    const now = new Date();
    const expires = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    await env.DB.prepare('INSERT INTO oauth_attempts (state_hash, browser_hash, nonce, pkce_verifier, return_to, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(await sha256(state), await sha256(browser), nonce, verifier, safeReturnTo(url.searchParams.get('returnTo')), expires, now.toISOString()).run();
    const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorization.search = new URLSearchParams({ client_id: env.GOOGLE_OAUTH_CLIENT_ID, redirect_uri: env.AUTH_REDIRECT_URI, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: await sha256(verifier), code_challenge_method: 'S256', prompt: 'select_account' }).toString();
    return new Response(null, { status: 302, headers: { Location: authorization.toString(), 'Set-Cookie': secureCookie(OAUTH_BROWSER_COOKIE, browser, 600, '/api/auth'), 'Cache-Control': 'no-store' } });
  } catch (error) {
    const authError = error instanceof AuthError ? error : new AuthError(500, 'Google 로그인을 시작하지 못했습니다.');
    return jsonResponse({ error: authError.message }, authError.status, { 'Cache-Control': 'no-store' });
  }
}
