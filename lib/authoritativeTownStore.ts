import { fetchMutation, fetchQuery } from "convex/nextjs";
import { makeFunctionReference } from "convex/server";

import {
  DEFAULT_MOCK_TOWN_ID,
  createMockTown,
  ensureLocalMockTownState,
  reseedTownFromExisting,
  seedOrReopenTownFromProfile,
} from "./mockData";
import { runLocalMockTick, runSimulationTick } from "./sim_engine";
import type { SessionUser } from "./session";
import type { SimulationTickResult, TownState } from "./types";

interface GetTownArgs extends Record<string, unknown> {
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

function readHostedMode(): string {
  return process.env.VILLAGESIM_STATE_MODE?.trim().toLowerCase() ?? "mock";
}

function getConvexOptions() {
  const url = process.env.CONVEX_URL;
  const adminToken = process.env.CONVEX_ADMIN_KEY;

  if (!url || url === "https://your-convex-deployment.convex.cloud") {
    throw new Error("Hosted Convex mode requires a real CONVEX_URL value.");
  }
  if (!adminToken || adminToken === "convex_admin_key_for_local_worker") {
    throw new Error("Hosted Convex mode requires a real CONVEX_ADMIN_KEY value.");
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
  return readHostedMode() === "convex";
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
    throw new Error(`Town ${args.townId} was not found.`);
  }

  if (args.reset) {
    town = await saveConvexTown({
      callerLogin: args.callerLogin,
      town: reseedTownFromExisting(town, { seed: args.seed }),
    });
  }

  let latestResult: SimulationTickResult | null = null;
  for (let index = 0; index < args.count; index += 1) {
    latestResult = await runSimulationTick(town);
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
