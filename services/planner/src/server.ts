import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { ZodError } from "zod";

import { MockPlannerProvider, type PlannerProvider } from "./providers/mock.js";
import { SlidingWindowRateLimiter } from "./rateLimit.js";
import { ReplayProtector, SecurityError, verifyPlannerRequest } from "./security.js";

const DEFAULT_PORT = 4000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_RATE_LIMIT_MAX = 30;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_REPLAY_WINDOW_MS = 5 * 60_000;

export interface PlannerServiceConfig {
  bearerToken: string;
  host: string;
  maxBodyBytes: number;
  port: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  replayWindowMs: number;
  signingSecret: string;
}

interface PlannerServiceDependencies {
  logger?: (entry: Record<string, unknown>) => void;
  now?: () => number;
  provider?: PlannerProvider;
  rateLimiter?: SlidingWindowRateLimiter;
  replayProtector?: ReplayProtector;
}

function readNonEmptyEnv(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required planner service env var ${name}`);
  }
  return value;
}

function readPositiveInt(name: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const parsed = Number.parseInt(env[name] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function readPlannerServiceConfig(env: NodeJS.ProcessEnv = process.env): PlannerServiceConfig {
  return {
    bearerToken: readNonEmptyEnv("VILLAGESIM_PLANNER_SERVICE_TOKEN", env),
    host: env.VILLAGESIM_PLANNER_SERVICE_HOST?.trim() || DEFAULT_HOST,
    maxBodyBytes: readPositiveInt("VILLAGESIM_PLANNER_SERVICE_MAX_BODY_BYTES", DEFAULT_MAX_BODY_BYTES, env),
    port: readPositiveInt("VILLAGESIM_PLANNER_SERVICE_PORT", DEFAULT_PORT, env),
    rateLimitMax: readPositiveInt("VILLAGESIM_PLANNER_SERVICE_RATE_LIMIT_MAX", DEFAULT_RATE_LIMIT_MAX, env),
    rateLimitWindowMs: readPositiveInt("VILLAGESIM_PLANNER_SERVICE_RATE_LIMIT_WINDOW_MS", DEFAULT_RATE_LIMIT_WINDOW_MS, env),
    replayWindowMs: readPositiveInt("VILLAGESIM_PLANNER_SERVICE_REPLAY_WINDOW_MS", DEFAULT_REPLAY_WINDOW_MS, env),
    signingSecret: readNonEmptyEnv("VILLAGESIM_PLANNER_SERVICE_SIGNING_SECRET", env),
  };
}

function sendJson(response: ServerResponse, statusCode: number, body: Record<string, unknown>, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload).toString(),
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(payload);
}

function normalizeClientKey(request: IncomingMessage): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]!.trim();
  }

  return request.socket.remoteAddress || "unknown";
}

async function readRequestBody(request: IncomingMessage, maxBodyBytes: number): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    request.on("data", (chunk: Buffer | string) => {
      if (settled) {
        return;
      }

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxBodyBytes) {
        settled = true;
        request.destroy();
        reject(new SecurityError(413, "body_too_large", "Planner request body exceeded the configured size cap"));
        return;
      }

      chunks.push(buffer);
    });

    request.on("end", () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    request.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    });
  });
}

function logRequest(
  logger: (entry: Record<string, unknown>) => void,
  details: {
    clientKey: string;
    failureReason?: string | null;
    method: string;
    path: string;
    requestId?: string | null;
    startedAtMs: number;
    statusCode: number;
  },
  nowMs: number,
): void {
  logger({
    clientKey: details.clientKey,
    failureReason: details.failureReason ?? null,
    latencyMs: nowMs - details.startedAtMs,
    method: details.method,
    path: details.path,
    requestId: details.requestId ?? null,
    statusCode: details.statusCode,
    timestamp: new Date(nowMs).toISOString(),
  });
}

export function createPlannerServiceHandler(
  config: PlannerServiceConfig,
  dependencies: PlannerServiceDependencies = {},
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const logger = dependencies.logger ?? ((entry) => console.log(JSON.stringify(entry)));
  const now = dependencies.now ?? (() => Date.now());
  const provider = dependencies.provider ?? new MockPlannerProvider();
  const rateLimiter = dependencies.rateLimiter ?? new SlidingWindowRateLimiter(config.rateLimitMax, config.rateLimitWindowMs);
  const replayProtector = dependencies.replayProtector ?? new ReplayProtector();

  return async (request, response) => {
    const startedAtMs = now();
    const method = request.method ?? "GET";
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const clientKey = normalizeClientKey(request);
    const requestIdHeader = request.headers["x-villagesim-request-id"];
    const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;

    let statusCode = 200;
    let failureReason: string | null = null;

    try {
      if (path === "/healthz" && method === "GET") {
        sendJson(response, 200, { status: "ok", service: "villagesim-planner" });
        return;
      }

      if (path !== "/plan") {
        statusCode = 404;
        failureReason = "not_found";
        sendJson(response, 404, { error: "not_found" });
        return;
      }

      if (method !== "POST") {
        statusCode = 405;
        failureReason = "method_not_allowed";
        sendJson(response, 405, { error: "method_not_allowed" }, { Allow: "POST" });
        return;
      }

      const rateLimit = rateLimiter.take(clientKey, startedAtMs);
      if (!rateLimit.allowed) {
        statusCode = 429;
        failureReason = "rate_limited";
        sendJson(
          response,
          429,
          { error: "rate_limited", requestId: requestId ?? null, retryAfterSeconds: rateLimit.retryAfterSeconds },
          { "Retry-After": rateLimit.retryAfterSeconds.toString() },
        );
        return;
      }

      const rawBody = await readRequestBody(request, config.maxBodyBytes);
      const requestEnvelope = verifyPlannerRequest({
        config: {
          bearerToken: config.bearerToken,
          replayWindowMs: config.replayWindowMs,
          signingSecret: config.signingSecret,
        },
        headers: new Headers(request.headers as Record<string, string>),
        nowMs: startedAtMs,
        rawBody,
        replayProtector,
      });

      const result = await provider.plan(requestEnvelope);
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof SecurityError) {
        statusCode = error.statusCode;
        failureReason = error.failureReason;
        sendJson(response, error.statusCode, { error: error.failureReason, requestId: requestId ?? null });
        return;
      }

      if (error instanceof ZodError) {
        statusCode = 400;
        failureReason = "invalid_request_shape";
        sendJson(response, 400, { error: "invalid_request_shape", requestId: requestId ?? null });
        return;
      }

      statusCode = 500;
      failureReason = error instanceof Error ? error.message : "internal_error";
      sendJson(response, 500, { error: "internal_error", requestId: requestId ?? null });
    } finally {
      logRequest(
        logger,
        {
          clientKey,
          failureReason,
          method,
          path,
          requestId,
          startedAtMs,
          statusCode,
        },
        now(),
      );
    }
  };
}

export function startPlannerService(config: PlannerServiceConfig = readPlannerServiceConfig()): ReturnType<typeof createServer> {
  const server = createServer(createPlannerServiceHandler(config));
  server.listen(config.port, config.host, () => {
    console.log(
      JSON.stringify({
        host: config.host,
        port: config.port,
        service: "villagesim-planner",
        status: "listening",
      }),
    );
  });
  return server;
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entrypoint && import.meta.url === entrypoint) {
  startPlannerService();
}
