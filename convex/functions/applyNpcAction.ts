import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { applyNpcActionToTown } from "../../lib/sim_engine";
import { assertCanWriteTown } from "../../lib/townAccess";
import type { NpcAction } from "../../lib/types";
import { readTownFromConvex, writeTownToConvex } from "../townStateStore";

export interface ApplyNpcActionArgs {
  callerLogin?: string | null;
  townId: string;
  npcId: string;
  action: NpcAction;
}

export const applyNpcAction = internalMutation({
  args: {
    callerLogin: v.optional(v.union(v.string(), v.null())),
    townId: v.string(),
    npcId: v.string(),
    action: v.any(),
  },
  handler: async (ctx, args) => {
    const town = await readTownFromConvex(ctx.db, args.townId);

    if (!town) {
      throw new Error(`Town ${args.townId} was not found.`);
    }

    assertCanWriteTown(town, args.callerLogin);
    const npc = applyNpcActionToTown(town, args.npcId, args.action as NpcAction);
    const savedTown = await writeTownToConvex(ctx.db, town);
    return { ok: true, npc, town: savedTown };
  },
});

export default applyNpcAction;
