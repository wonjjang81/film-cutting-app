import type { D1Database } from './_types';

export const SESSION_COOKIE = 'film_session';
export const OAUTH_BROWSER_COOKIE = 'film_oauth_browser';
export const DEFAULT_TENANT_ID = 'film-cutting-team';

export class AuthError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export type GoogleIdentity = { subject: string; email: string; name?: string; picture?: string };

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateGoogleClaims(payload: Record<string, unknown>, options: { clientId: string; nonce: string; nowSeconds?: number }): GoogleIdentity {
  const issuer = payload.iss;
  const audience = payload.aud;
  const email = normalizeEmail(payload.email);
  const subject = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  const expiresAt = typeof payload.exp === 'number' ? payload.exp : 0;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (issuer !== 'https://accounts.google.com' && issuer !== 'accounts.google.com') throw new AuthError(403, 'Google 토큰 발급자가 올바르지 않습니다.');
  if (audience !== options.clientId || payload.azp && payload.azp !== options.clientId) throw new AuthError(403, 'Google 토큰 대상이 올바르지 않습니다.');
  if (!subject || payload.nonce !== options.nonce || expiresAt <= now) throw new AuthError(403, 'Google 토큰이 만료되었거나 재사용되었습니다.');
  if (payload.email_verified !== true || !email) throw new AuthError(403, '검증된 Google 이메일이 필요합니다.');
  const authoritative = email.endsWith('@gmail.com') || email.endsWith('@googlemail.com') || typeof payload.hd === 'string';
  if (!authoritative) throw new AuthError(403, 'Google이 관리하는 검증된 이메일만 사용할 수 있습니다.');
  return {
    subject,
    email,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}

export type OAuthAttempt = { nonce: string; pkce_verifier: string; return_to: string };

export async function consumeOAuthAttempt(db: D1Database, stateHash: string, browserHash: string, nowIso: string): Promise<OAuthAttempt | null> {
  return db.prepare('DELETE FROM oauth_attempts WHERE state_hash = ?1 AND browser_hash = ?2 AND expires_at > ?3 RETURNING nonce, pkce_verifier, return_to')
    .bind(stateHash, browserHash, nowIso).first<OAuthAttempt>();
}

export function selectBootstrapAction(input: { email: string; ownerEmail: string; matchingLegacyIds: string[]; bootstrapOwnerId: string | null }): { kind: 'bind-owner'; userId: string } | { kind: 'create-owner' } | { kind: 'collision' } | { kind: 'deny' } {
  if (normalizeEmail(input.email) !== normalizeEmail(input.ownerEmail) || input.bootstrapOwnerId) return { kind: 'deny' };
  if (input.matchingLegacyIds.length > 1) return { kind: 'collision' };
  return input.matchingLegacyIds.length === 1 ? { kind: 'bind-owner', userId: input.matchingLegacyIds[0]! } : { kind: 'create-owner' };
}

export type SessionRecord = {
  userId: string;
  email: string;
  userStatus: string;
  membershipStatus: string;
  tenantId: string;
  sessionTenantId: string;
  role: 'owner' | 'member';
  absoluteExpiresAt: string;
  idleExpiresAt: string;
};

export type AuthIdentity = { userId: string; email: string; tenantId: string; role: 'owner' | 'member' };

export function authorizeSessionRecord(record: SessionRecord, now = new Date()): AuthIdentity {
  if (record.userStatus !== 'active' || record.membershipStatus !== 'active') throw new AuthError(403, '사용이 중지되었거나 승인되지 않은 계정입니다.');
  if (!record.tenantId || record.tenantId !== record.sessionTenantId) throw new AuthError(403, '다른 작업공간의 세션입니다.');
  if (Date.parse(record.absoluteExpiresAt) <= now.getTime() || Date.parse(record.idleExpiresAt) <= now.getTime()) throw new AuthError(401, '로그인 세션이 만료되었습니다.');
  if (record.role !== 'owner' && record.role !== 'member') throw new AuthError(403, '허용되지 않은 권한입니다.');
  return { userId: record.userId, email: normalizeEmail(record.email), tenantId: record.tenantId, role: record.role };
}

export function publicSessionUser(identity: AuthIdentity): { id: string; email: string; role: 'owner' | 'member' } {
  return { id: identity.userId, email: identity.email, role: identity.role };
}

export function restoredMembershipStatus(role: string): 'active' | 'review_pending' {
  return role === 'owner' ? 'active' : 'review_pending';
}

export function requireOwner(identity: AuthIdentity): void {
  if (identity.role !== 'owner') throw new AuthError(403, '관리자 권한이 필요합니다.');
}

export function safeReturnTo(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/input';
}

export function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get('Cookie') ?? '';
  for (const part of cookies.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function secureCookie(name: string, value: string, maxAge: number, path = '/'): string {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie(name: string, path = '/'): string {
  return secureCookie(name, '', 0, path);
}

export function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return base64Url(data);
}

function base64Url(data: Uint8Array): string {
  let binary = '';
  data.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function sha256(value: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}
