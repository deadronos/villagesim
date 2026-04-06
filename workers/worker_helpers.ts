import { ensureLocalMockTownState, getEnvironmentForNpc, getLocalMockTownState, setLocalMockTownState } from "../lib/mockData";
import { requestNpcPlan } from "../lib/model_proxy";
import { applyNpcActionToTown, assignPlanToTown, collectNpcsNeedingDecision } from "../lib/sim_engine";
import { runLocalMockTick } from "../lib/localTick";
import type { NpcAction, NpcPlan, PlannerRequest, SimulationTickResult, TownState } from "../lib/types";

export async function fetchTownSnapshot(townId: string): Promise<TownState> {
  return ensureLocalMockTownState({ id: townId });
}

export async function fetchNpcsNeedingDecision(townId: string, thresholdTicks = 0) {
  const town = ensureLocalMockTownState({ id: townId });
  return collectNpcsNeedingDecision(town, thresholdTicks);
}

export async function getLocalEnvSlice(townId: string, npcId: string) {
  const town = ensureLocalMockTownState({ id: townId });
  return getEnvironmentForNpc(town, npcId);
}

export async function applyImmediateAction(townId: string, npcId: string, action: NpcAction) {
  const town = getLocalMockTownState(townId);
  applyNpcActionToTown(town, npcId, action);
  setLocalMockTownState(town);
  return town.npcs[npcId];
}

export async function assignPlanToNpc(townId: string, npcId: string, plan: NpcPlan) {
  const town = getLocalMockTownState(townId);
  assignPlanToTown(town, npcId, plan);
  setLocalMockTownState(town);
  return town.npcs[npcId];
}

export async function callModelForPlan(request: PlannerRequest) {
  return requestNpcPlan(request);
}

export async function runWorkerTick(townId: string): Promise<SimulationTickResult> {
  return runLocalMockTick(townId);
}
