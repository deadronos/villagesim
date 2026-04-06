import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { assignPlanToTown } from "../../lib/sim_engine";
import { assertCanWriteTown } from "../../lib/townAccess";
import type { NpcPlan } from "../../lib/types";
import { readTownFromConvex, writeTownToConvex } from "../townStateStore";

export interface AssignPlanToNpcArgs {
  callerLogin?: string | null;
  townId: string;
  npcId: string;
  plan: NpcPlan;
}

export const assignPlanToNpc = internalMutation({
  args: {
    callerLogin: v.optional(v.union(v.string(), v.null())),
    townId: v.string(),
    npcId: v.string(),
    plan: v.any(),
  },
  handler: async (ctx, args) => {
    const town = await readTownFromConvex(ctx.db, args.townId);

    if (!town) {
      throw new Error(`Town ${args.townId} was not found.`);
    }

    assertCanWriteTown(town, args.callerLogin);
    const npc = assignPlanToTown(town, args.npcId, args.plan as NpcPlan);
    const savedTown = await writeTownToConvex(ctx.db, town);
    return { ok: true, npc, town: savedTown };
  },
});

export default assignPlanToNpc;
