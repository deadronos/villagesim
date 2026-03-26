const INTERNAL_API_TOKEN_ENV = "VILLAGESIM_INTERNAL_API_TOKEN";

function normalizeToken(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function readInternalApiToken(env: NodeJS.ProcessEnv = process.env): string | null {
  return normalizeToken(env[INTERNAL_API_TOKEN_ENV]);
}

export function createInternalApiHeaders(token: string = readInternalApiToken() ?? ""): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function isInternalApiRequestAuthorized(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const token = readInternalApiToken(env);
  if (!token) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${token}`;
}
