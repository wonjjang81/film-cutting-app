import { describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './estimate';

const env = { CONSTRUCTION_MANAGER_ORIGIN: 'https://cm.example', CONSTRUCTION_MANAGER_SERVICE_TOKEN: 'cmi_test' } as any;
const request = (body: Record<string, unknown> = { total: 1 }) => new Request('https://film.example/api/integrations/construction-manager/estimate', { method: 'POST', body: JSON.stringify(body) });

describe('construction manager estimate submission', () => {
  it('requires a signed-in account', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await onRequestPost({ request: request(), env, data: {} } as any);
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('forwards the session email as the submitter so the construction manager can check access', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true}', { status: 201, headers: { 'Content-Type': 'application/json' } }));
    const response = await onRequestPost({ request: request({ total: 1, submittedBy: 'spoof@example.com' }), env, data: { auth: { userId: 'u', email: 'member@example.com', tenantId: 't', role: 'member' } } } as any);
    expect(response.status).toBe(201);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://cm.example/api/integrations/v1/estimate-snapshots');
    expect(JSON.parse(String(init.body))).toMatchObject({ schema: 'film-estimate/v1', submittedBy: 'member@example.com', total: 1 });
    fetchSpy.mockRestore();
  });
});
