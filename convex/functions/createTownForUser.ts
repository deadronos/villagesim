import { seedOrReopenTownFromProfile, type GithubProfileSeed } from "../../lib/mockData";

export interface CreateTownForUserArgs {
  callerLogin?: string | null;
  profile: GithubProfileSeed;
  tokenSummary?: string | null;
  townId?: string;
  seed?: string;
}

// Placeholder for future OAuth / Convex integration. Keeps local-first seeding coherent.
export async function createTownForUser(_ctx: unknown, args: CreateTownForUserArgs) {
  if (args.callerLogin && args.callerLogin !== args.profile.login) {
    throw new Error(`Town creation is only allowed for the authenticated user @${args.callerLogin}.`);
  }

  const town = seedOrReopenTownFromProfile(args.profile, {
    id: args.townId,
    seed: args.seed,
    tokenSummary: args.tokenSummary,
  });
  return { ok: true, townId: town.id, town };
}

export default createTownForUser;
