import type { TileType, TownData, TownNpc } from "../../../components/TownCanvas";
import type { NpcState, TownEvent, TownState } from "../../../lib/types";

const WEATHER_LABELS = ["Clear skies", "Soft rain", "Cool breeze", "Lantern glow"];

export function normalizeTownId(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;

  return (
    raw
      ?.toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "starter-hollow"
  );
}

export function titleizeTownId(townId: string) {
  return townId
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function weatherLabelForTown(town: TownState) {
  const index = Math.abs((town.tick + town.seed.length) % WEATHER_LABELS.length);
  return WEATHER_LABELS[index] ?? WEATHER_LABELS[0];
}

function timeOfDayLabel(tick: number) {
  const hour = tick % 24;

  if (hour < 6) {
    return "Night watch";
  }
  if (hour < 12) {
    return "Morning tick";
  }
  if (hour < 18) {
    return "Midday bustle";
  }
  return "Evening wind-down";
}

function summarizeAction(npc: NpcState) {
  if (npc.currentAction) {
    switch (npc.currentAction.type) {
      case "move":
        return "moving through town";
      case "work":
        return npc.currentAction.task;
      case "eat":
        return "grabbing a meal";
      case "rest":
        return "resting";
      case "speak":
        return "chatting";
      case "trade":
        return "trading goods";
      case "gather":
        return `gathering ${npc.currentAction.item}`;
      case "wait":
      default:
        return "waiting briefly";
    }
  }

  if (npc.plan && npc.plan.status !== "done") {
    return `planning ${npc.plan.intent}`;
  }

  return "idle";
}

function moodForNpc(npc: NpcState) {
  const stress = npc.status.hunger + npc.status.energy + npc.status.social;

  if (stress < 90) {
    return "optimistic";
  }
  if (stress < 140) {
    return "steady";
  }
  if (stress < 190) {
    return "focused";
  }
  return "frayed";
}

function paletteForRole(role: NpcState["role"]) {
  switch (role) {
    case "farmer":
      return { accent: "#355d3d", body: "#d9e27d" };
    case "merchant":
      return { accent: "#7a2e2e", body: "#f6b36b" };
    case "builder":
      return { accent: "#2b3f55", body: "#f3d27a" };
    case "baker":
      return { accent: "#8b4a2f", body: "#f0c8a0" };
    case "guard":
    default:
      return { accent: "#5a3e7a", body: "#f0a5c5" };
  }
}

function createBaseMap(width: number, height: number): TileType[][] {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      if (x < 2 && y > 2 && y < Math.min(height - 2, 9)) {
        return "water";
      }
      if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && (x + y) % 3 === 0) {
        return "tree";
      }
      return "grass";
    }),
  );
}

function paintPath(map: TileType[][], from: { x: number; y: number }, to: { x: number; y: number }) {
  const current = { x: Math.round(from.x), y: Math.round(from.y) };
  const target = { x: Math.round(to.x), y: Math.round(to.y) };

  while (current.x !== target.x) {
    map[current.y]![current.x] = "path";
    current.x += current.x < target.x ? 1 : -1;
  }

  while (current.y !== target.y) {
    map[current.y]![current.x] = "path";
    current.y += current.y < target.y ? 1 : -1;
  }

  map[current.y]![current.x] = "path";
}

function buildMapFromTown(town: TownState): TileType[][] {
  const map = createBaseMap(town.map.width, town.map.height);
  const plaza = town.locations.find((location) => location.kind === "plaza")?.position ?? {
    x: Math.floor(town.map.width / 2),
    y: Math.floor(town.map.height / 2),
  };

  for (const location of town.locations) {
    const x = Math.max(0, Math.min(map[0]!.length - 1, Math.round(location.position.x)));
    const y = Math.max(0, Math.min(map.length - 1, Math.round(location.position.y)));
    let tile: TileType;

    switch (location.kind) {
      case "field":
        tile = "field";
        break;
      case "market":
      case "plaza":
      case "tavern":
        tile = "plaza";
        break;
      case "home":
      case "bakery":
      case "workshop":
        tile = "home";
        break;
      default:
        tile = "grass";
        break;
    }

    paintPath(map, plaza, { x, y });
    map[y]![x] = tile;
  }

  return map;
}

function eventTone(kind: TownEvent["kind"]): "good" | "neutral" | "alert" {
  if (kind === "plan_assigned" || kind === "plan_completed") {
    return "good";
  }

  if (kind === "decision") {
    return "alert";
  }

  return "neutral";
}

function mapNpc(npc: NpcState): TownNpc {
  const actionLabel = summarizeAction(npc);
  const mood = moodForNpc(npc);

  return {
    currentAction: actionLabel,
    energy: Math.max(0, 100 - npc.status.energy),
    hunger: npc.status.hunger,
    id: npc.id,
    mood,
    name: npc.name,
    palette: paletteForRole(npc.role),
    position: npc.position,
    role: npc.role,
    social: npc.status.social,
    summary: `${npc.name} is ${actionLabel} and feels ${mood}.`,
  };
}

export function mapTownData(town: TownState): TownData {
  return {
    activityFeed: town.events.slice(-6).reverse().map((event) => ({
      id: event.id,
      label: event.message,
      tone: eventTone(event.kind),
    })),
    description: `Shared mock state for ${town.owner.displayName ?? titleizeTownId(town.id)} with local tick updates and planner-ready NPC data.`,
    id: town.id,
    map: buildMapFromTown(town),
    name: town.name,
    notes: [
      "This route now reads from the shared local-first backend mock state.",
      "The page polls `/api/tick` to keep the village feeling live without external services.",
      "GitHub OAuth remains a placeholder until the real auth flow is wired.",
    ],
    npcs: Object.values(town.npcs).map(mapNpc),
    seedLabel: town.seed,
    timeOfDay: timeOfDayLabel(town.tick),
    weather: weatherLabelForTown(town),
  };
}
