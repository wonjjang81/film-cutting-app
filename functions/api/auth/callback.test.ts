import { describe, expect, it } from 'vitest';

import type { D1Database, D1PreparedStatement, D1RunResult } from '../../_types';
import { resolveUser } from './callback';

type AccountState = {
  id: string;
  email: string;
  googleSub: string | null;
  userStatus: 'active' | 'disabled';
  membershipStatus: 'invited' | 'active' | 'disabled' | 'review_pending';
};

function accountDatabase(state: AccountState): D1Database {
  const prepare = (query: string): D1PreparedStatement => {
    let values: unknown[] = [];
    const statement: D1PreparedStatement = {
      bind: (...nextValues) => { values = nextValues; return statement; },
      first: async <T>() => {
        if (query.includes('WHERE google_sub = ?1')) {
          return (state.googleSub === values[0]
            ? { id: state.id, google_sub: state.googleSub, email_norm: state.email, status: state.userStatus }
            : null) as T | null;
        }
        if (query.includes('WHERE email_norm = ?1')) {
          return (state.email === values[0]
            ? { id: state.id, google_sub: state.googleSub, email_norm: state.email, status: state.userStatus }
            : null) as T | null;
        }
        if (query.includes('SELECT role, status FROM memberships')) {
          return { role: 'member', status: state.membershipStatus } as T;
        }
        return null;
      },
      run: async () => apply(query, values),
      all: async <T>() => ({ results: [] as T[] }),
    };
    return statement;
  };
  const apply = async (query: string, values: unknown[]): Promise<D1RunResult> => {
    if (query.includes('UPDATE users SET google_sub')) {
      if (state.googleSub !== null) return { meta: { changes: 0 } };
      state.googleSub = String(values[0]);
      return { meta: { changes: 1 } };
    }
    if (query.includes('UPDATE memberships SET status')) {
      state.membershipStatus = query.includes("status = 'active'")
        ? 'active'
        : String(values[0]) as AccountState['membershipStatus'];
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 1 } };
  };
  return {
    prepare,
    batch: async (statements) => Promise.all(statements.map((statement) => statement.run())),
  };
}

describe('Google callback account binding', () => {
  it('activates an invited registered email on its first verified Google login', async () => {
    const state: AccountState = {
      id: 'member-1',
      email: 'member@gmail.com',
      googleSub: null,
      userStatus: 'active',
      membershipStatus: 'invited',
    };

    await expect(resolveUser(accountDatabase(state), {
      subject: 'google-sub-member-1',
      email: 'member@gmail.com',
      name: 'Member',
    }, 'tubebluemoon@gmail.com')).resolves.toEqual({ userId: 'member-1', role: 'member' });
    expect(state).toMatchObject({ googleSub: 'google-sub-member-1', membershipStatus: 'active' });
  });

  it('does not bind a Google identity to a disabled registered email', async () => {
    const state: AccountState = {
      id: 'member-2',
      email: 'disabled@gmail.com',
      googleSub: null,
      userStatus: 'active',
      membershipStatus: 'disabled',
    };

    await expect(resolveUser(accountDatabase(state), {
      subject: 'google-sub-disabled',
      email: 'disabled@gmail.com',
    }, 'tubebluemoon@gmail.com')).rejects.toMatchObject({ status: 403 });
    expect(state.googleSub).toBeNull();
  });
});
