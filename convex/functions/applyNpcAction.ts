import { ensureLocalMockTownState, setLocalMockTownState } from "../../lib/mockData";
import { applyNpcActionToTown } from "../../lib/sim_engine";
import type { NpcAction } from "../../lib/types";

export interface ApplyNpcActionArgs {
  townId: string;
  npcId: string;
  action: NpcAction;
}

// Local-first stub: real Convex wiring can wrap this pure handler later.
export async function applyNpcAction(_ctx: unknown, args: ApplyNpcActionArgs) {
  const town = ensureLocalMockTownState({ id: args.townId });
  const npc = applyNpcActionToTown(town, args.npcId, args.action);
  setLocalMockTownState(town);
  return { ok: true, npc, town };
}

export default applyNpcAction;
