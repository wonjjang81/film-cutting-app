import type { AuthIdentity } from '../../_auth';
import { publicSessionUser } from '../../_auth';
import type { CloudflareEnv, PagesContext } from '../../_types';
import { jsonResponse } from '../../_types';

export function onRequestGet({ data }: PagesContext<CloudflareEnv, { auth?: AuthIdentity }>): Response {
  return jsonResponse({ user: publicSessionUser(data.auth!) }, 200, { 'Cache-Control': 'no-store' });
}
