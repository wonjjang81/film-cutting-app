export type D1RunResult = { meta?: { changes?: number } };

export type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1RunResult>;
};

export type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

export type CloudflareEnv = {
  DB?: D1Database;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ALLOWED_ORIGIN?: string;
};

export type PagesContext<Env extends CloudflareEnv = CloudflareEnv> = {
  request: Request;
  env: Env;
};

export function jsonResponse(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}
