import type {
  DecisionCandidate,
  DecisionCandidateType,
  DecisionTarget,
  NpcAction,
  NpcEnvironment,
  NpcState,
  PlanIntent,
  RandomSource,
  ScoredDecisionCandidate,
  WeightedDecisionResult,
  DecisionWeights,
} from "./types";

export const DEFAULT_DECISION_WEIGHTS: DecisionWeights = {
  hunger: 1.2,
  energy: 1.05,
  social: 0.9,
  focus: 0.75,
  proximityDecay: 0.92,
  planThreshold: 1.35,
  noise: 0.08,
  role: {
    farmer: { work: 1.45, trade: 0.75 },
    merchant: { trade: 1.55, social: 1.1, work: 0.85 },
    baker: { work: 1.4, trade: 0.95 },
    builder: { work: 1.5, rest: 0.95 },
    guard: { social: 1.2, work: 1.15, trade: 0.7 },
  },
};

function targetFromEnv(kind: DecisionCandidateType, env: NpcEnvironment): DecisionTarget | undefined {
  switch (kind) {
    case "work": {
      const location = env.nearby.workshop ?? env.nearby.field ?? env.nearby.market;
      return location
        ? { id: location.id, kind: "location", position: location.position, label: location.label }
        : undefined;
    }
    case "eat": {
      const location = env.nearby.food;
      return location
        ? { id: location.id, kind: "location", position: location.position, label: location.label }
        : undefined;
    }
    case "rest": {
      const location = env.nearby.home;
      return location
        ? { id: location.id, kind: "location", position: location.position, label: location.label }
        : undefined;
    }
    case "trade": {
      const location = env.nearby.market ?? env.nearby.food;
      return location
        ? { id: location.id, kind: "location", position: location.position, label: location.label }
        : undefined;
    }
    case "social": {
      const person = env.nearby.people[0];
      if (person) {
        return { id: person.id, kind: "npc", position: person.position, label: person.name };
      }
      const location = env.nearby.plaza;
      return location
        ? { id: location.id, kind: "location", position: location.position, label: location.label }
        : undefined;
    }
    default:
      return undefined;
  }
}

export function buildDecisionCandidates(npc: NpcState, env: NpcEnvironment): DecisionCandidate[] {
  return [
    {
      type: "work",
      base: 0.95 + (env.timeOfDay === "morning" || env.timeOfDay === "afternoon" ? 0.15 : -0.15),
      target: targetFromEnv("work", env),
      reason: `${npc.name} can make role progress right now.`,
      prefersPlan: true,
    },
    {
      type: "eat",
      base: 0.75 + (npc.inventory.food > 0 ? 0.15 : 0),
      target: targetFromEnv("eat", env),
      reason: `${npc.name} may want food soon.`,
    },
    {
      type: "rest",
      base: 0.65 + (env.timeOfDay === "night" ? 0.25 : 0),
      target: targetFromEnv("rest", env),
      reason: `${npc.name} could recover some energy.`,
    },
    {
      type: "social",
      base: 0.55 + (env.nearby.people.length > 0 ? 0.1 : 0),
      target: targetFromEnv("social", env),
      reason: `${npc.name} could check in with neighbours.`,
      prefersPlan: true,
    },
    {
      type: "trade",
      base: 0.6 + (npc.inventory.grain > 0 || npc.inventory.wood > 0 ? 0.1 : 0),
      target: targetFromEnv("trade", env),
      reason: `${npc.name} could rebalance village goods.`,
      prefersPlan: true,
    },
    {
      type: "wait",
      base: 0.25,
      reason: `${npc.name} can idle briefly if nothing is urgent.`,
    },
  ];
}

function candidateNeedFactor(candidate: DecisionCandidate, npc: NpcState, weights: DecisionWeights): number {
  switch (candidate.type) {
    case "eat":
      return 1 + (npc.status.hunger / 100) * weights.hunger;
    case "rest":
      return 1 + (npc.status.energy / 100) * weights.energy;
    case "social":
      return 1 + (npc.status.social / 100) * weights.social;
    case "work":
      return 1 + ((100 - npc.status.focus) / 100) * weights.focus;
    case "trade":
      return 1 + (((npc.inventory.grain + npc.inventory.wood) > 0 ? 15 : 0) / 100);
    default:
      return 1;
  }
}

function scoreCandidate(
  npc: NpcState,
  env: NpcEnvironment,
  candidate: DecisionCandidate,
  weights: DecisionWeights,
  rng: RandomSource,
): number {
  let score = candidate.base;
  score *= weights.role[npc.role]?.[candidate.type] ?? 1;
  score *= candidateNeedFactor(candidate, npc, weights);

  if (candidate.target) {
    const distance = Math.max(1, env.distances[candidate.target.id] ?? Math.hypot(candidate.target.position.x - npc.position.x, candidate.target.position.y - npc.position.y));
    score *= Math.pow(weights.proximityDecay, distance / 3);
  }

  const jitter = 1 - weights.noise / 2 + rng() * weights.noise;
  return Math.max(0.01, score * jitter);
}

function pickWeighted(scoredCandidates: ScoredDecisionCandidate[], rng: RandomSource): ScoredDecisionCandidate {
  const total = scoredCandidates.reduce((sum, candidate) => sum + candidate.score, 0);
  let threshold = rng() * total;
  for (const candidate of scoredCandidates) {
    threshold -= candidate.score;
    if (threshold <= 0) {
      return candidate;
    }
  }
  return scoredCandidates[scoredCandidates.length - 1];
}

function decisionToPlanIntent(type: DecisionCandidateType): PlanIntent {
  switch (type) {
    case "work":
      return "work";
    case "trade":
      return "trade";
    case "social":
      return "social";
    default:
      return "explore";
  }
}

function createImmediateAction(npc: NpcState, selected: DecisionCandidate): NpcAction {
  const target = selected.target;
  const distance = target ? Math.hypot(target.position.x - npc.position.x, target.position.y - npc.position.y) : 0;

  switch (selected.type) {
    case "work":
      if (target && distance > 1.5) {
        return { type: "move", target: target.position, targetId: target.id, speed: 1 };
      }
      return { type: "work", task: `${npc.role} task`, targetId: target?.id, remainingTicks: 1 };
    case "eat":
      if (target && distance > 1.5 && npc.inventory.food <= 0) {
        return { type: "move", target: target.position, targetId: target.id, speed: 1 };
      }
      return { type: "eat", amount: 1, targetId: target?.id };
    case "rest":
      if (target && distance > 1.5) {
        return { type: "move", target: target.position, targetId: target.id, speed: 1 };
      }
      return { type: "rest", remainingTicks: 1, targetId: target?.id };
    case "social":
      if (target && distance > 1.5) {
        return { type: "move", target: target.position, targetId: target.id, speed: 1 };
      }
      return { type: "speak", text: `Hi ${target?.label ?? "there"}!`, targetId: target?.id };
    case "trade":
      if (target && distance > 1.5) {
        return { type: "move", target: target.position, targetId: target.id, speed: 1 };
      }
      return { type: "trade", item: npc.status.hunger > 55 ? "food" : "grain", amount: 1, targetId: target?.id };
    case "wait":
    default:
      return { type: "wait", remainingTicks: 1 };
  }
}

export interface WeightedDecisionOptions {
  rng?: RandomSource;
  weights?: DecisionWeights;
}

export function weightedDecision(
  npc: NpcState,
  env: NpcEnvironment,
  options: WeightedDecisionOptions = {},
): WeightedDecisionResult {
  const rng = options.rng ?? (() => 0.5);
  const weights = options.weights ?? DEFAULT_DECISION_WEIGHTS;
  const candidates = buildDecisionCandidates(npc, env);
  const scoredCandidates = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(npc, env, candidate, weights, rng),
    }))
    .sort((left, right) => right.score - left.score);

  const selected = pickWeighted(scoredCandidates, rng).candidate;
  const selectedScore = scoredCandidates.find((entry) => entry.candidate.type === selected.type)?.score ?? 0;
  const shouldRequestPlan = Boolean(
    selected.prefersPlan && (!npc.plan || npc.plan.status === "done") && selectedScore >= weights.planThreshold,
  );

  if (shouldRequestPlan) {
    return {
      decision: "plan_required",
      selected,
      scoredCandidates,
      planIntent: decisionToPlanIntent(selected.type),
    };
  }

  return {
    decision: "immediate_action",
    selected,
    scoredCandidates,
    action: createImmediateAction(npc, selected),
  };
}
