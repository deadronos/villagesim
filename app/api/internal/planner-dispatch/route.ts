import { NextResponse } from "next/server";

import { isInternalApiRequestAuthorized } from "../../../../lib/internalApi";
import { dispatchHostedPlannerQueue, isHostedConvexModeEnabled } from "../../../../lib/authoritativeTownStore";
import type { PlannerDispatchSource } from "../../../../lib/types";

export const dynamic = "force-dynamic";

const ALLOWED_DISPATCH_SOURCES = new Set<PlannerDispatchSource>(["after-response", "internal-route", "cron", "manual"]);

function jsonResponse(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

function isPlannerDispatchSource(value: unknown): value is PlannerDispatchSource {
  return typeof value === "string" && ALLOWED_DISPATCH_SOURCES.has(value as PlannerDispatchSource);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  if (!isInternalApiRequestAuthorized(request)) {
    return jsonResponse({ ok: false, error: "Unauthorized internal dispatch request." }, 401);
  }

  if (!isHostedConvexModeEnabled()) {
    return jsonResponse({
      ok: true,
      mode: "mock-local",
      processed: 0,
      remaining: 0,
    });
  }

  const body = await readBody(request);
  const townId = typeof body.townId === "string" ? body.townId.trim() : "";
  const source = isPlannerDispatchSource(body.source) ? body.source : "internal-route";

  if (!townId) {
    return jsonResponse({ ok: false, error: "Planner dispatch requires a townId." }, 400);
  }

  try {
    const result = await dispatchHostedPlannerQueue({
      bypassAccessCheck: true,
      source,
      townId,
    });

    return jsonResponse({
      ok: true,
      mode: "convex-hosted",
      source,
      townId,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown planner dispatch failure";
    return jsonResponse({ ok: false, error: message, townId }, 500);
  }
}
