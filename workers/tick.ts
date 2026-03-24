import { DEFAULT_MOCK_TOWN_ID, ensureLocalMockTownState, resetLocalMockTown } from "../lib/mockData";
import { runWorkerTick } from "./worker_helpers";

function readFlag(name: string): string | undefined {
  const direct = process.argv.find((argument: string) => argument.startsWith(`--${name}=`));
  if (direct) {
    return direct.split("=")[1];
  }
  const index = process.argv.findIndex((argument: string) => argument === `--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export async function main() {
  const townId = readFlag("town") ?? DEFAULT_MOCK_TOWN_ID;
  const seed = readFlag("seed");
  const count = Math.max(1, Number.parseInt(readFlag("count") ?? "1", 10) || 1);

  if (hasFlag("reset")) {
    resetLocalMockTown({ id: townId, seed });
  } else {
    ensureLocalMockTownState({ id: townId, seed });
  }

  let latestResult = null;
  for (let index = 0; index < count; index += 1) {
    latestResult = await runWorkerTick(townId);
  }

  return {
    ok: true,
    mode: "mock-local-worker",
    townId,
    ticksRun: count,
    summary: latestResult?.summary ?? null,
    town: latestResult?.town ?? null,
  };
}

const isDirectRun = /(?:^|[\/])tick\.(?:js|ts)$/.test(process.argv[1] ?? "");

if (isDirectRun) {
  main()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
