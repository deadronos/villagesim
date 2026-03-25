import { v } from "convex/values";

import { internalQuery } from "../_generated/server";
import { assertCanReadTown } from "../../lib/townAccess";
import { readTownFromConvex } from "../townStateStore";

export interface GetTownArgs {
  callerLogin?: string | null;
  townId: string;
  seed?: string;
}

export const getTown = internalQuery({
  args: {
    callerLogin: v.optional(v.union(v.string(), v.null())),
    townId: v.string(),
    seed: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const town = await readTownFromConvex(ctx.db, args.townId);

    if (!town) {
      return null;
    }

    assertCanReadTown(town, args.callerLogin);
    return town;
  },
});

export default getTown;
