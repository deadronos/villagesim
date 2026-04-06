import { createMockTown } from "../lib/mockData";
import { runSimulationTick } from "../lib/sim_engine";
import { TownState, NpcState } from "../lib/types";

function createLargeTown(npcCount: number): TownState {
  const town = createMockTown();
  const baseNpcs = Object.values(town.npcs);
  const newNpcs: Record<string, NpcState> = {};

  for (let i = 0; i < npcCount; i++) {
    const template = baseNpcs[i % baseNpcs.length];
    const id = `npc-large-${i}`;
    newNpcs[id] = {
      ...template,
      id,
      name: `${template.name} ${i}`,
    };
  }
  town.npcs = newNpcs;
  return town;
}

async function benchmark() {
  const npcCounts = [5, 50, 500, 1000];
  const iterations = 10;

  console.log(`| NPC Count | Total Time (ms) | Avg Time/Tick (ms) |`);
  console.log(`|-----------|-----------------|--------------------|`);

  for (const count of npcCounts) {
    const town = createLargeTown(count);

    // Warm up
    await runSimulationTick(town);

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await runSimulationTick(town);
    }
    const end = performance.now();
    const totalTime = end - start;
    const avgTime = totalTime / iterations;

    console.log(`| ${count.toString().padEnd(9)} | ${totalTime.toFixed(2).toString().padEnd(15)} | ${avgTime.toFixed(2).toString().padEnd(18)} |`);
  }
}

benchmark().catch(console.error);
