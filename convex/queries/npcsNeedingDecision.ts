import { ensureLocalMockTownState } from "../../lib/mockData";
import { collectNpcsNeedingDecision } from "../../lib/sim_engine";

export interface NpcsNeedingDecisionArgs {
  townId: string;
  thresholdTicks?: number;
}

// Local-first query stub matching the starter's intended Convex shape.
export async function npcsNeedingDecision(_ctx: unknown, args: NpcsNeedingDecisionArgs) {
  const town = ensureLocalMockTownState({ id: args.townId });
  return collectNpcsNeedingDecision(town, args.thresholdTicks ?? 0);
}

export default npcsNeedingDecision;
