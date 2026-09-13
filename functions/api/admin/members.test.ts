import { describe, expect, it } from 'vitest';

import type { D1Database, D1PreparedStatement, D1RunResult, PagesContext } from '../../_types';
import { DEFAULT_TENANT_ID, type AuthIdentity } from '../../_auth';
import { onRequestPost } from './members';

function schemaCheckingDatabase(): D1Database {
  const prepare = (query: string): D1PreparedStatement => {
    let values: unknown[] = [];
    const statement: D1PreparedStatement = {
      bind: (...nextValues) => { values = nextValues; return statement; },
      first: async <T>() => null as T | null,
      all: async <T>() => ({ results: [] as T[] }),
      run: async (): Promise<D1RunResult> => {
        if (query.includes('INSERT INTO users')) {
          if (!query.includes('email_norm')) throw new Error('users.email_norm is required');
          expect(values).toContain('member@gmail.com');
        }
        if (query.includes('INSERT INTO memberships')) {
          if (!query.includes('(id, tenant_id, user_id, invited_email_norm')) throw new Error('membership identity fields are required');
          expect(values).toContain(DEFAULT_TENANT_ID);
          expect(values).toContain('member@gmail.com');
        }
        return { meta: { changes: 1 } };
      },
    };
    return statement;
  };
  return { prepare, batch: async (statements) => Promise.all(statements.map((statement) => statement.run())) };
}

describe('member registration', () => {
  it('stores every required identity field so a Google email can be invited', async () => {
    const auth: AuthIdentity = { userId: 'owner-1', email: 'owner@gmail.com', tenantId: DEFAULT_TENANT_ID, role: 'owner' };
    const context = {
      request: new Request('https://film-cutting-app.pages.dev/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ' Member@Gmail.com ' }),
      }),
      env: { DB: schemaCheckingDatabase() },
      data: { auth },
      next: async () => new Response(null),
    } as PagesContext<any, { auth: AuthIdentity }>;

    const response = await onRequestPost(context);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ member: { email: 'member@gmail.com', status: 'invited' } });
  });
});
