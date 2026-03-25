import { v } from "convex/values";

import { cloneTownState, createTownFromProfile, type GithubProfileSeed } from "../../lib/mockData";
import { internalMutation } from "../_generated/server";
import { readTownFromConvex, writeTownToConvex } from "../townStateStore";

export interface CreateTownForUserArgs {
  callerLogin?: string | null;
  profile: GithubProfileSeed;
  tokenSummary?: string | null;
  townId?: string;
  seed?: string;
}

function ownerFromProfile(profile: GithubProfileSeed) {
  return {
    login: profile.login,
    displayName: profile.name ?? profile.login,
    ...(typeof profile.avatar_url === "string" ? { avatarUrl: profile.avatar_url } : {}),
  };
}

export const createTownForUser = internalMutation({
  args: {
    callerLogin: v.optional(v.union(v.string(), v.null())),
    profile: v.object({
      login: v.string(),
      name: v.optional(v.union(v.string(), v.null())),
      avatar_url: v.optional(v.union(v.string(), v.null())),
    }),
    tokenSummary: v.optional(v.union(v.string(), v.null())),
    townId: v.optional(v.string()),
    seed: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.callerLogin && args.callerLogin !== args.profile.login) {
      throw new Error(`Town creation is only allowed for the authenticated user @${args.callerLogin}.`);
    }

    const townId = args.townId ?? `${args.profile.login}-town`;
    const existing = await readTownFromConvex(ctx.db, townId);

    if (existing && existing.owner.login === args.profile.login && existing.metadata.createdFrom === "profile") {
      const reopened = cloneTownState(existing);
      reopened.owner = ownerFromProfile(args.profile);
      if (args.tokenSummary !== undefined) {
        reopened.metadata.tokenSummary = args.tokenSummary;
      }

      const town = await writeTownToConvex(ctx.db, reopened);
      return { ok: true, townId: town.id, town };
    }

    if (existing) {
      throw new Error(`Town ${townId} already exists and is not owned by @${args.profile.login}.`);
    }

    const created = createTownFromProfile(args.profile, {
      id: args.townId,
      seed: args.seed,
      tokenSummary: args.tokenSummary,
    });
    const town = await writeTownToConvex(ctx.db, created);
    return { ok: true, townId: town.id, town };
  },
});

export default createTownForUser;
