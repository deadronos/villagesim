import { ensureLocalMockTownState, findLocalMockTownState } from "../../lib/mockData";
import { assertCanReadTown } from "../../lib/townAccess";

export interface GetTownArgs {
  callerLogin?: string | null;
  townId: string;
  seed?: string;
}

// Local-first query stub matching the starter's intended Convex shape.
export async function getTown(_ctx: unknown, args: GetTownArgs) {
  const town = findLocalMockTownState(args.townId) ?? ensureLocalMockTownState({ id: args.townId, seed: args.seed });
  assertCanReadTown(town, args.callerLogin);
  return town;
}

export default getTown;
