import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from './cm-launch';

const code = 'c'.repeat(64);
function env(account: unknown = { id: 'u1' }) {
  const batch = vi.fn(async () => []);
  const prepare = vi.fn(() => ({ bind: () => ({ first: async () => account }) }));
  return { batch, env: { DB: { prepare, batch }, CONSTRUCTION_MANAGER_ORIGIN: 'https://cm.example', CONSTRUCTION_MANAGER_SERVICE_TOKEN: 'cmi_x' } as any };
}
const next = encodeURIComponent('/login?cmProjectId=p&cmProjectName=x&cmExternalEntityId=p');
const call = (query: string, environment: any) => onRequestGet({ request: new Request(`https://film.example/api/auth/cm-launch?${query}`), env: environment } as any);

afterEach(() => vi.restoreAllMocks());

describe('construction manager launch sign-in', () => {
  it('starts a session for the existing account and keeps the project context', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ email: 'Owner@Gmail.com' }), { status: 200 }));
    const { env: environment, batch } = env();
    const response = await call(`code=${code}&next=${next}`, environment);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login?cmProjectId=p&cmProjectName=x&cmExternalEntityId=p');
    expect(response.headers.get('Set-Cookie')).toContain('film_session=');
    expect(batch).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://cm.example/api/integrations/v1/launch-codes/verify');
  });

  it('never redirects outside the app and falls back to login on failure', async () => {
    const { env: environment, batch } = env(null);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ email: 'nobody@gmail.com' }), { status: 200 }));
    const response = await call(`code=${code}&next=${encodeURIComponent('//evil.example')}`, environment);
    expect(response.headers.get('Location')).toBe('/input?cmLaunchError=no_account');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(batch).not.toHaveBeenCalled();
    expect((await call('code=bad', environment)).headers.get('Location')).toContain('cmLaunchError=invalid_code');
  });
});
