import { NextResponse } from "next/server";

import {
  DEFAULT_MOCK_TOWN_ID,
  ensureLocalMockTownState,
  findLocalMockTownState,
  getLocalMockTownState,
  resetLocalMockTown,
  resetLocalMockTownFromExisting,
} from "../../../lib/mockData";
import { getSessionFromCookieHeader } from "../../../lib/session";
import { isHostedConvexModeEnabled, runAuthoritativeTick } from "../../../lib/authoritativeTownStore";
import { runLocalMockTick } from "../../../lib/sim_engine";
import { assertCanWriteTown, isTownAccessError, TownAccessError } from "../../../lib/townAccess";

export const dynamic = "force-dynamic";

const MAX_BATCH_TICKS = 5;

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

function parseBoolean(value: unknown): boolean {
  const normalized = firstString(value);
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseTickCount(value: unknown): number {
  const parsed = Number.parseInt(firstString(value) ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return Math.min(MAX_BATCH_TICKS, parsed);
}

function jsonResponse(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

function getSession(request: Request) {
  return getSessionFromCookieHeader(request.headers.get("cookie") ?? "");
}

function readQuerySource(request: Request) {
  const searchParams = new URL(request.url).searchParams;

  return {
    count: searchParams.get("count"),
    reset: searchParams.get("reset"),
    seed: searchParams.get("seed"),
    townId: searchParams.get("townId"),
  };
}

async function readBodySource(request: Request) {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function handleTick(request: Request, source: Record<string, unknown>) {
  try {
    const townId = firstString(source.townId) ?? DEFAULT_MOCK_TOWN_ID;
    const seed = firstString(source.seed);
    const reset = parseBoolean(source.reset);
    const count = parseTickCount(source.count);
    const session = getSession(request);
    const callerLogin = session?.user.login ?? null;

    if (isHostedConvexModeEnabled()) {
      const result = await runAuthoritativeTick({
        callerLogin,
        count,
        reset,
        seed,
        sessionUser: session?.user ?? null,
        townId,
      });

      return jsonResponse({
        ok: true,
        mode: "convex-hosted",
        townId,
        tickCount: count,
        town: result.town,
        summary: result.summary,
        npcResults: result.npcResults,
        events: result.town.events.slice(-30),
      });
    }

    const existingTown = findLocalMockTownState(townId);

    if (existingTown) {
      assertCanWriteTown(existingTown, callerLogin);
    }

    if (reset) {
      if (existingTown) {
        resetLocalMockTownFromExisting(existingTown, { seed });
      } else {
        resetLocalMockTown({ id: townId, seed });
      }
    } else {
      ensureLocalMockTownState({ id: townId, seed });
    }

    const results = [];
    for (let index = 0; index < count; index += 1) {
      results.push(await runLocalMockTick(townId));
    }

    const latestTown = results[results.length - 1]?.town ?? getLocalMockTownState(townId);

    return jsonResponse({
      ok: true,
      mode: "mock-local",
      townId,
      tickCount: count,
      town: latestTown,
      summary: results[results.length - 1]?.summary ?? null,
      npcResults: results.flatMap((result) => result.npcResults),
      events: latestTown.events.slice(-30),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tick failure";
    return jsonResponse(
      { ok: false, mode: isHostedConvexModeEnabled() ? "convex-hosted" : "mock-local", error: message },
      error instanceof TownAccessError || isTownAccessError(error) ? 403 : 500,
    );
  }
}

export async function GET(request: Request) {
  return handleTick(request, readQuerySource(request));
}

export async function POST(request: Request) {
  return handleTick(request, await readBodySource(request));
}
