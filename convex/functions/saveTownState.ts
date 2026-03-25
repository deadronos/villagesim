import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { assertCanWriteTown } from "../../lib/townAccess";
import type { TownState } from "../../lib/types";
import { readTownFromConvex, writeTownToConvex } from "../townStateStore";

export interface SaveTownStateArgs {
  callerLogin?: string | null;
  town: TownState;
}

export const saveTownState = internalMutation({
  args: {
    callerLogin: v.optional(v.union(v.string(), v.null())),
    town: v.any(),
  },
  handler: async (ctx, args) => {
    const town = args.town as TownState;
    const existing = await readTownFromConvex(ctx.db, town.id);

    if (existing) {
      assertCanWriteTown(existing, args.callerLogin);
    } else {
      assertCanWriteTown(town, args.callerLogin);
    }

    return writeTownToConvex(ctx.db, town);
  },
});

export default saveTownState;
