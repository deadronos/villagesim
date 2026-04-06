import { requestNpcPlan } from "./model_proxy";
import { runSimulationTick, type SimulationTickOptions } from "./sim_engine";
import { ensureLocalMockTownState, getLocalMockTownState, setLocalMockTownState } from "./mockData";
import { createSeededRng } from "./mockData";
import type { SimulationTickResult } from "./types";

export async function runLocalMockTick(
  townId: string,
  options: Omit<SimulationTickOptions, "rng"> & { seed?: string } = {},
): Promise<SimulationTickResult> {
  const currentTown = options.seed
    ? ensureLocalMockTownState({ id: townId, seed: options.seed })
    : getLocalMockTownState(townId);
  const rng = createSeededRng(`${currentTown.seed}:${currentTown.tick + 1}`);
  const result = await runSimulationTick(currentTown, { ...options, rng, planner: options.planner ?? requestNpcPlan });
  setLocalMockTownState(result.town);
  return result;
}