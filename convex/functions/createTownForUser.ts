import { createTownFromProfile, type GithubProfileSeed, setLocalMockTownState } from "../../lib/mockData";

export interface CreateTownForUserArgs {
  profile: GithubProfileSeed;
  tokenSummary?: string | null;
  townId?: string;
  seed?: string;
}

// Placeholder for future OAuth / Convex integration. Keeps local-first seeding coherent.
export async function createTownForUser(_ctx: unknown, args: CreateTownForUserArgs) {
  const town = createTownFromProfile(args.profile, {
    id: args.townId,
    seed: args.seed,
    tokenSummary: args.tokenSummary,
  });
  setLocalMockTownState(town);
  return { ok: true, townId: town.id, town };
}

export default createTownForUser;
