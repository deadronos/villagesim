import { NextResponse } from "next/server";

import {
  DEFAULT_MOCK_TOWN_ID,
  ensureLocalMockTownState,
  getLocalMockTownState,
  resetLocalMockTown,
} from "../../../lib/mockData";
import { runLocalMockTick } from "../../../lib/sim_engine";

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

async function handleTick(source: Record<string, unknown>) {
  try {
    const townId = firstString(source.townId) ?? DEFAULT_MOCK_TOWN_ID;
    const seed = firstString(source.seed);
    const reset = parseBoolean(source.reset);
    const count = parseTickCount(source.count);

    if (reset) {
      resetLocalMockTown({ id: townId, seed });
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
    return jsonResponse({ ok: false, mode: "mock-local", error: message }, 500);
  }
}

export async function GET(request: Request) {
  return handleTick(readQuerySource(request));
}

export async function POST(request: Request) {
  return handleTick(await readBodySource(request));
}
