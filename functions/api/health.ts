import type { CloudflareEnv, PagesContext } from '../_types';
import { jsonResponse } from '../_types';

export function onRequestGet({ env }: PagesContext<CloudflareEnv>): Response {
  return jsonResponse({ ok: true, service: 'film-cutting-api', databaseConfigured: Boolean(env.DB) });
}
