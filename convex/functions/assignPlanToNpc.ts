import { ensureLocalMockTownState, setLocalMockTownState } from "../../lib/mockData";
import { assignPlanToTown } from "../../lib/sim_engine";
import type { NpcPlan } from "../../lib/types";

export interface AssignPlanToNpcArgs {
  townId: string;
  npcId: string;
  plan: NpcPlan;
}

// Local-first stub: real Convex mutations can delegate to the same pure helper.
export async function assignPlanToNpc(_ctx: unknown, args: AssignPlanToNpcArgs) {
  const town = ensureLocalMockTownState({ id: args.townId });
  const npc = assignPlanToTown(town, args.npcId, args.plan);
  setLocalMockTownState(town);
  return { ok: true, npc, town };
}

export default assignPlanToNpc;
