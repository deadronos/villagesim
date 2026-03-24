import { ensureLocalMockTownState } from "../../lib/mockData";

export interface GetTownArgs {
  townId: string;
  seed?: string;
}

// Local-first query stub matching the starter's intended Convex shape.
export async function getTown(_ctx: unknown, args: GetTownArgs) {
  return ensureLocalMockTownState({ id: args.townId, seed: args.seed });
}

export default getTown;
