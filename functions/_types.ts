export type D1RunResult = { meta?: { changes?: number } };

export type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1RunResult>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
};

export type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1RunResult[]>;
};

export type CloudflareEnv = {
  DB?: D1Database;
  ALLOWED_ORIGIN?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  AUTH_REDIRECT_URI?: string;
  AUTH_OWNER_EMAIL?: string;
};

export type PagesContext<Env extends CloudflareEnv = CloudflareEnv, Data extends Record<string, unknown> = Record<string, unknown>> = {
  request: Request;
  env: Env;
  data: Data;
  next(): Promise<Response>;
};

export function jsonResponse(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}
