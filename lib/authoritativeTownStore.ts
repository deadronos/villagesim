import { randomUUID } from "node:crypto";

import { fetchMutation, fetchQuery } from "convex/nextjs";
import { makeFunctionReference } from "convex/server";

import {
  DEFAULT_MOCK_TOWN_ID,
  createMockTown,
  ensureLocalMockTownState,
  reseedTownFromExisting,
  seedOrReopenTownFromProfile,
} from "./mockData";
import { requestNpcPlan } from "./model_proxy";
import {
  claimHostedPlannerQueueEntry,
  completeHostedPlannerQueueEntry,
  createHostedPlannerQueueForTick,
  failHostedPlannerQueueEntry,
  recordHostedPlannerDispatchMetrics,
  readHostedPlannerDrainPerDispatch,
} from "./plannerExecution";
import { runLocalMockTick } from "./localTick";
import { runSimulationTick } from "./sim_engine";
import type { SessionUser } from "./session";
import type { PlannerDispatchSource, SimulationTickResult, TownState } from "./types";

interface GetTownArgs extends Record<string, unknown> {
  bypassAccessCheck?: boolean;
  callerLogin?: string | null;
  townId: string;
  seed?: string;
}

interface CreateTownForUserArgs extends Record<string, unknown> {
  callerLogin?: string | null;
  profile: {
    login: string;
    name?: string | null;
    avatar_url?: string | null;
  };
  tokenSummary?: string | null;
  townId?: string;
  seed?: string;
}

interface SaveTownStateArgs extends Record<string, unknown> {
  bypassAccessCheck?: boolean;
  callerLogin?: string | null;
  town: TownState;
}

interface EnsureTownArgs {
  callerLogin?: string | null;
  sessionUser?: SessionUser | null;
  seed?: string;
  tokenSummary?: string | null;
  townId: string;
}

interface RunTickArgs extends EnsureTownArgs {
  count: number;
  reset?: boolean;
}

const getTownQuery = makeFunctionReference<"query", GetTownArgs, TownState | null>("queries/getTown:getTown");
const createTownForUserMutation =
  makeFunctionReference<"mutation", CreateTownForUserArgs, { ok: true; townId: string; town: TownState }>(
    "functions/createTownForUser:createTownForUser",
  );
const saveTownStateMutation = makeFunctionReference<"mutation", SaveTownStateArgs, TownState>(
  "functions/saveTownState:saveTownState",
);
const STATE_MODE_MOCK = "mock";
const STATE_MODE_CONVEX = "convex";

function readHostedMode(): string {
  return process.env.VILLAGESIM_STATE_MODE?.trim().toLowerCase() ?? STATE_MODE_MOCK;
}

function getConvexOptions() {
  const url = process.env.CONVEX_URL;
  const adminToken = process.env.CONVEX_ADMIN_KEY;

  if (!url || url === "https://your-convex-deployment.convex.cloud") {
    throw new Error("Convex hosted mode requires CONVEX_URL to be set to your deployment URL.");
  }
  if (!adminToken || adminToken === "convex_admin_key_for_local_worker") {
    throw new Error("Convex hosted mode requires CONVEX_ADMIN_KEY to be set to your deployment admin key.");
  }

  return {
    url,
    adminToken,
  };
}

function profileFromSessionUser(sessionUser: SessionUser) {
  return {
    login: sessionUser.login,
    name: sessionUser.name ?? null,
    avatar_url: sessionUser.avatarUrl ?? null,
  };
}

async function fetchConvexTown(args: GetTownArgs): Promise<TownState | null> {
  return fetchQuery(getTownQuery, args, getConvexOptions());
}

async function saveConvexTown(args: SaveTownStateArgs): Promise<TownState> {
  return fetchMutation(saveTownStateMutation, args, getConvexOptions());
}

async function createConvexTownForUser(args: CreateTownForUserArgs): Promise<TownState> {
  const result = await fetchMutation(createTownForUserMutation, args, getConvexOptions());
  return result.town;
}

export function isHostedConvexModeEnabled(): boolean {
  return readHostedMode() === STATE_MODE_CONVEX;
}

export async function createOrReopenTownForProfile(args: {
  callerLogin?: string | null;
  profile: CreateTownForUserArgs["profile"];
  seed?: string;
  tokenSummary?: string | null;
  townId?: string;
}): Promise<TownState> {
  if (!isHostedConvexModeEnabled()) {
    return seedOrReopenTownFromProfile(args.profile, {
      id: args.townId,
      seed: args.seed,
      tokenSummary: args.tokenSummary,
    });
  }

  return createConvexTownForUser(args);
}

export async function ensureAuthoritativeTown(args: EnsureTownArgs): Promise<TownState | null> {
  if (!isHostedConvexModeEnabled()) {
    return ensureLocalMockTownState({ id: args.townId, seed: args.seed });
  }

  const existingTown = await fetchConvexTown({
    callerLogin: args.callerLogin,
    townId: args.townId,
    seed: args.seed,
  });

  if (existingTown) {
    return existingTown;
  }

  if (args.sessionUser && args.townId === `${args.sessionUser.login}-town`) {
    return createConvexTownForUser({
      callerLogin: args.callerLogin,
      profile: profileFromSessionUser(args.sessionUser),
      seed: args.seed,
      tokenSummary: args.tokenSummary,
      townId: args.townId,
    });
  }

  if (args.townId === DEFAULT_MOCK_TOWN_ID) {
    return saveConvexTown({
      callerLogin: args.callerLogin,
      town: createMockTown({ id: args.townId, seed: args.seed }),
    });
  }

  return null;
}

export async function runAuthoritativeTick(args: RunTickArgs): Promise<SimulationTickResult> {
  if (!isHostedConvexModeEnabled()) {
    return runLocalMockTick(args.townId, { seed: args.seed });
  }

  let town = await ensureAuthoritativeTown(args);

  if (!town) {
    throw new Error(`Town ${args.townId} was not found in Convex hosted storage.`);
  }

  if (args.reset) {
    town = await saveConvexTown({
      callerLogin: args.callerLogin,
      town: reseedTownFromExisting(town, { seed: args.seed }),
    });
  }

  let latestResult: SimulationTickResult | null = null;
  for (let index = 0; index < args.count; index += 1) {
    const hostedPlannerQueue = createHostedPlannerQueueForTick(town.id, town.tick + 1);
    latestResult = await runSimulationTick(town, {
      callerLogin: args.callerLogin,
      planner: hostedPlannerQueue.planner,
    });
    hostedPlannerQueue.finalizeTown(latestResult.town, latestResult.summary.planner);
    town = await saveConvexTown({
      callerLogin: args.callerLogin,
      town: latestResult.town,
    });
    latestResult = {
      ...latestResult,
      mode: "convex-hosted",
      town,
    };
  }

  if (!latestResult) {
    throw new Error(`No simulation tick was executed for town ${args.townId}.`);
  }

  return latestResult;
}

export async function dispatchHostedPlannerQueue(args: {
  bypassAccessCheck?: boolean;
  callerLogin?: string | null;
  source?: PlannerDispatchSource;
  townId: string;
}): Promise<{
  claimed: number;
  completed: number;
  dispatching: number;
  failed: number;
  processed: number;
  queued: number;
  remaining: number;
  skipped: number;
}> {
  if (!isHostedConvexModeEnabled()) {
    return {
      claimed: 0,
      completed: 0,
      dispatching: 0,
      failed: 0,
      processed: 0,
      queued: 0,
      remaining: 0,
      skipped: 0,
    };
  }

  const source = args.source ?? "manual";
  const dispatchStartedAt = Date.now();
  let claimed = 0;
  let completed = 0;
  let failed = 0;
  let processed = 0;
  let skipped = 0;
  let queued = 0;
  let dispatching = 0;
  const maxDispatches = readHostedPlannerDrainPerDispatch();

  for (let index = 0; index < maxDispatches; index += 1) {
    const town = await fetchConvexTown({
      bypassAccessCheck: args.bypassAccessCheck,
      callerLogin: args.callerLogin,
      townId: args.townId,
    });

    if (!town) {
      break;
    }

    const claimToken = randomUUID();
    const claimedEntry = claimHostedPlannerQueueEntry(town, {
      dispatchToken: claimToken,
      now: Date.now(),
      source,
    });

    if (!claimedEntry) {
      queued = town.metadata.planner?.metrics.queuedCount ?? 0;
      dispatching = town.metadata.planner?.metrics.dispatchingCount ?? 0;
      break;
    }

    claimed += 1;
    await saveConvexTown({
      bypassAccessCheck: args.bypassAccessCheck,
      callerLogin: args.callerLogin,
      town,
    });

    try {
      const result = await requestNpcPlan(claimedEntry.request);
      const latestTown = await fetchConvexTown({
        bypassAccessCheck: args.bypassAccessCheck,
        callerLogin: args.callerLogin,
        townId: args.townId,
      });

      if (!latestTown) {
        skipped += 1;
        break;
      }

      const settlement = completeHostedPlannerQueueEntry(latestTown, {
        completedAt: Date.now(),
        queueId: claimedEntry.id,
        result,
        token: claimToken,
      });

      queued = settlement.queued;
      dispatching = settlement.dispatching;

      if (settlement.outcome === "stale") {
        skipped += 1;
        continue;
      }

      processed += 1;
      completed += 1;
      await saveConvexTown({
        bypassAccessCheck: args.bypassAccessCheck,
        callerLogin: args.callerLogin,
        town: latestTown,
      });
    } catch (error) {
      const latestTown = await fetchConvexTown({
        bypassAccessCheck: args.bypassAccessCheck,
        callerLogin: args.callerLogin,
        townId: args.townId,
      });

      if (!latestTown) {
        skipped += 1;
        break;
      }

      const settlement = failHostedPlannerQueueEntry(latestTown, {
        completedAt: Date.now(),
        error,
        queueId: claimedEntry.id,
        token: claimToken,
      });

      queued = settlement.queued;
      dispatching = settlement.dispatching;

      if (settlement.outcome === "stale") {
        skipped += 1;
        continue;
      }

      processed += 1;
      failed += 1;
      await saveConvexTown({
        bypassAccessCheck: args.bypassAccessCheck,
        callerLogin: args.callerLogin,
        town: latestTown,
      });
    }
  }

  const finalTown = await fetchConvexTown({
    bypassAccessCheck: args.bypassAccessCheck,
    callerLogin: args.callerLogin,
    townId: args.townId,
  });

  if (finalTown) {
    const counts = recordHostedPlannerDispatchMetrics(finalTown, {
      completedAt: Date.now(),
      processed,
      result: processed === 0 ? "noop" : failed > 0 ? (completed > 0 ? "partial" : "failed") : "success",
      source,
      startedAt: dispatchStartedAt,
    });
    queued = counts.queued;
    dispatching = counts.dispatching;
    await saveConvexTown({
      bypassAccessCheck: args.bypassAccessCheck,
      callerLogin: args.callerLogin,
      town: finalTown,
    });
  }

  return {
    claimed,
    completed,
    dispatching,
    failed,
    processed,
    queued,
    remaining: queued + dispatching,
    skipped,
  };
}
