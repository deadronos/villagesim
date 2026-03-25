import { v } from "convex/values";

import { internalQuery } from "../_generated/server";
import { collectNpcsNeedingDecision } from "../../lib/sim_engine";
import { readTownFromConvex } from "../townStateStore";

export interface NpcsNeedingDecisionArgs {
  townId: string;
  thresholdTicks?: number;
}

export const npcsNeedingDecision = internalQuery({
  args: {
    townId: v.string(),
    thresholdTicks: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const town = await readTownFromConvex(ctx.db, args.townId);
    if (!town) {
      return [];
    }
    return collectNpcsNeedingDecision(town, args.thresholdTicks ?? 0);
  },
});

export default npcsNeedingDecision;
