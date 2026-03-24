import type { NextApiRequest, NextApiResponse } from "next";

import {
  DEFAULT_MOCK_TOWN_ID,
  ensureLocalMockTownState,
  getLocalMockTownState,
  resetLocalMockTown,
} from "../../lib/mockData";
import { runLocalMockTick } from "../../lib/sim_engine";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method && !["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const source = req.method === "POST" ? req.body ?? {} : req.query;
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
    return res.status(200).json({
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
    return res.status(500).json({ ok: false, mode: "mock-local", error: message });
  }
}
