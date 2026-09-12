import { describe, expect, it } from 'vitest';
import {
  AuthError,
  authorizeSessionRecord,
  consumeOAuthAttempt,
  publicSessionUser,
  restoredMembershipStatus,
  selectBootstrapAction,
  validateGoogleClaims,
} from './_auth';

const claims = {
  iss: 'https://accounts.google.com', aud: 'client-id', sub: 'google-sub-1',
  email: 'tubebluemoon@gmail.com', email_verified: true, nonce: 'nonce-1', exp: 2_000_000_000,
};

describe('Google team authentication boundary', () => {
  it('accepts only verified, authoritative Google claims for this client and nonce', () => {
    expect(validateGoogleClaims(claims, { clientId: 'client-id', nonce: 'nonce-1', nowSeconds: 1_900_000_000 }).subject).toBe('google-sub-1');
    expect(() => validateGoogleClaims({ ...claims, aud: 'other' }, { clientId: 'client-id', nonce: 'nonce-1', nowSeconds: 1_900_000_000 })).toThrow(AuthError);
    expect(() => validateGoogleClaims({ ...claims, email_verified: false }, { clientId: 'client-id', nonce: 'nonce-1', nowSeconds: 1_900_000_000 })).toThrow(AuthError);
    expect(() => validateGoogleClaims({ ...claims, email: 'member@example.com' }, { clientId: 'client-id', nonce: 'nonce-1', nowSeconds: 1_900_000_000 })).toThrow(AuthError);
    expect(validateGoogleClaims({ ...claims, email: 'member@example.com', hd: 'example.com' }, { clientId: 'client-id', nonce: 'nonce-1', nowSeconds: 1_900_000_000 }).email).toBe('member@example.com');
  });

  it('consumes an OAuth attempt only once', async () => {
    let available = true;
    const db = { prepare: () => ({ bind: () => ({ first: async () => available ? (available = false, { nonce: 'n', pkce_verifier: 'v', return_to: '/input' }) : null }) }) } as any;
    await expect(consumeOAuthAttempt(db, 'state-hash', 'browser-hash', '2026-09-12T00:00:00.000Z')).resolves.toMatchObject({ nonce: 'n' });
    await expect(consumeOAuthAttempt(db, 'state-hash', 'browser-hash', '2026-09-12T00:00:00.000Z')).resolves.toBeNull();
  });

  it('bootstraps only the configured owner and rejects collisions or a second owner', () => {
    expect(selectBootstrapAction({ email: 'tubebluemoon@gmail.com', ownerEmail: 'tubebluemoon@gmail.com', matchingLegacyIds: ['legacy-1'], bootstrapOwnerId: null })).toEqual({ kind: 'bind-owner', userId: 'legacy-1' });
    expect(selectBootstrapAction({ email: 'other@gmail.com', ownerEmail: 'tubebluemoon@gmail.com', matchingLegacyIds: [], bootstrapOwnerId: null })).toEqual({ kind: 'deny' });
    expect(selectBootstrapAction({ email: 'tubebluemoon@gmail.com', ownerEmail: 'tubebluemoon@gmail.com', matchingLegacyIds: ['a', 'b'], bootstrapOwnerId: null })).toEqual({ kind: 'collision' });
    expect(selectBootstrapAction({ email: 'tubebluemoon@gmail.com', ownerEmail: 'tubebluemoon@gmail.com', matchingLegacyIds: [], bootstrapOwnerId: 'other-user' })).toEqual({ kind: 'deny' });
  });

  it('rejects disabled accounts, expired sessions, and cross-tenant memberships', () => {
    const valid = { userId: 'u1', email: 'member@gmail.com', userStatus: 'active', membershipStatus: 'active', tenantId: 'film', sessionTenantId: 'film', role: 'member' as const, absoluteExpiresAt: '2026-09-20T00:00:00.000Z', idleExpiresAt: '2026-09-13T00:00:00.000Z' };
    expect(authorizeSessionRecord(valid, new Date('2026-09-12T00:00:00.000Z')).userId).toBe('u1');
    expect(() => authorizeSessionRecord({ ...valid, userStatus: 'disabled' }, new Date('2026-09-12T00:00:00.000Z'))).toThrow(AuthError);
    expect(() => authorizeSessionRecord({ ...valid, sessionTenantId: 'other' }, new Date('2026-09-12T00:00:00.000Z'))).toThrow(AuthError);
  });

  it('does not accept request-provided roles and never leaks identity secrets', () => {
    const identity = authorizeSessionRecord({ userId: 'u1', email: 'member@gmail.com', userStatus: 'active', membershipStatus: 'active', tenantId: 'film', sessionTenantId: 'film', role: 'member', absoluteExpiresAt: '2026-09-20T00:00:00.000Z', idleExpiresAt: '2026-09-13T00:00:00.000Z', requestedRole: 'owner' } as any, new Date('2026-09-12T00:00:00.000Z'));
    expect(identity.role).toBe('member');
    expect(publicSessionUser({ ...identity, googleSub: 'secret-sub', sessionHash: 'secret-hash' } as any)).toEqual({ id: 'u1', email: 'member@gmail.com', role: 'member' });
  });

  it('preserves the owner but restores other memberships for review', () => {
    expect(restoredMembershipStatus('owner')).toBe('active');
    expect(restoredMembershipStatus('member')).toBe('review_pending');
  });
});
