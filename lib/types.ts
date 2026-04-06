export type RandomSource = () => number;

export interface Position {
  x: number;
  y: number;
}

export interface TownOwner {
  login: string;
  displayName?: string;
  avatarUrl?: string;
}

export type NpcRole = "farmer" | "merchant" | "builder" | "baker" | "guard";
export type TownLocationKind = "home" | "field" | "market" | "bakery" | "plaza" | "workshop" | "tavern";
export type ResourceKind = "food" | "grain" | "wood" | "coins";
export type PlanIntent = "work" | "trade" | "social" | "restock" | "explore";
export type DecisionCandidateType = "work" | "eat" | "rest" | "social" | "trade" | "wait";
export type ActionStatus = "pending" | "active" | "done" | "blocked";
export type NpcActionType = "move" | "work" | "eat" | "rest" | "speak" | "trade" | "wait" | "gather";
export type PlannerSource = "mock" | "remote" | "queued-placeholder";
export type PlannerFallbackReason = "budget_exhausted" | "hosted_background_queue" | "remote_failure";
export type PlannerQueueStatus = "queued" | "dispatching" | "completed" | "failed";
export type PlannerDispatchSource = "after-response" | "internal-route" | "cron" | "manual";

export interface NpcNeeds {
  hunger: number;
  energy: number;
  social: number;
  focus: number;
}

export interface NpcInventory {
  food: number;
  grain: number;
  wood: number;
  coins: number;
}

export interface NpcMemory {
  recentEvents: string[];
  summary: string;
}

export interface TownLocation {
  id: string;
  kind: TownLocationKind;
  label: string;
  position: Position;
  inventory?: Partial<Record<ResourceKind, number>>;
}

export interface NpcSummary {
  id: string;
  name: string;
  role: NpcRole;
  position: Position;
}

export type DecisionTarget =
  | { id: string; kind: "location"; position: Position; label: string }
  | { id: string; kind: "npc"; position: Position; label: string };

export interface ActionBase {
  type: NpcActionType;
  startedAtTick?: number;
  remainingTicks?: number;
  targetId?: string;
  planStepId?: string;
}

export interface MoveAction extends ActionBase {
  type: "move";
  target: Position;
  speed?: number;
}

export interface WorkAction extends ActionBase {
  type: "work";
  task: string;
}

export interface EatAction extends ActionBase {
  type: "eat";
  amount?: number;
}

export interface RestAction extends ActionBase {
  type: "rest";
}

export interface SpeakAction extends ActionBase {
  type: "speak";
  text: string;
}

export interface TradeAction extends ActionBase {
  type: "trade";
  item: ResourceKind;
  amount: number;
}

export interface WaitAction extends ActionBase {
  type: "wait";
}

export interface GatherAction extends ActionBase {
  type: "gather";
  item: Extract<ResourceKind, "grain" | "wood">;
  count: number;
}

export type NpcAction =
  | MoveAction
  | WorkAction
  | EatAction
  | RestAction
  | SpeakAction
  | TradeAction
  | WaitAction
  | GatherAction;

export interface PlanStepBase {
  id: string;
  status: ActionStatus;
  note?: string;
}

export interface PlanMoveStep extends PlanStepBase {
  type: "move";
  target: Position;
}

export interface PlanWorkStep extends PlanStepBase {
  type: "work";
  task: string;
  targetId?: string;
}

export interface PlanGatherStep extends PlanStepBase {
  type: "gather";
  item: Extract<ResourceKind, "grain" | "wood">;
  count: number;
  targetId?: string;
}

export interface PlanSpeakStep extends PlanStepBase {
  type: "speak";
  text: string;
  targetId?: string;
}

export interface PlanRestStep extends PlanStepBase {
  type: "rest";
}

export interface PlanTradeStep extends PlanStepBase {
  type: "trade";
  item: ResourceKind;
  amount: number;
  targetId?: string;
}

export interface PlanWaitStep extends PlanStepBase {
  type: "wait";
  seconds: number;
}

export type NpcPlanStep =
  | PlanMoveStep
  | PlanWorkStep
  | PlanGatherStep
  | PlanSpeakStep
  | PlanRestStep
  | PlanTradeStep
  | PlanWaitStep;

export interface NpcPlan {
  id: string;
  intent: PlanIntent;
  rationale: string;
  createdAt: number;
  updatedAt: number;
  status: ActionStatus;
  currentStepIndex: number;
  steps: NpcPlanStep[];
  planner?: {
    source: PlannerSource;
    queueId?: string;
    requestedAt?: number;
    completedAt?: number;
    latencyMs?: number;
    fallbackReason?: PlannerFallbackReason | null;
    failureReason?: string | null;
  };
}

export interface NpcState {
  id: string;
  name: string;
  role: NpcRole;
  homeId: string;
  workplaceId?: string;
  position: Position;
  status: NpcNeeds;
  inventory: NpcInventory;
  memory: NpcMemory;
  lastDecisionTick: number;
  currentAction: NpcAction | null;
  plan: NpcPlan | null;
}

export interface TownEvent {
  id: string;
  tick: number;
  at: number;
  npcId?: string;
  kind:
    | "tick"
    | "decision"
    | "action_started"
    | "action_completed"
    | "plan_assigned"
    | "plan_completed"
    | "planner_queued"
    | "planner_completed"
    | "planner_failed"
    | "planner_fallback"
    | "planner_budget_exhausted";
  message: string;
  details?: Record<string, unknown>;
}

export interface PlannerRequestSnapshot {
  townId: string;
  callerLogin?: string | null;
  tick: number;
  npc: NpcState;
  env: NpcEnvironment;
  intent: PlanIntent;
  now: number;
}

export interface PlannerQueueEntry {
  id: string;
  npcId: string;
  intent: PlanIntent;
  requestedAt: number;
  requestedTick: number;
  prompt: string;
  request: PlannerRequestSnapshot;
  placeholderPlanId: string;
  status: PlannerQueueStatus;
  assignedPlanId?: string;
  appliedPlan?: boolean;
  source?: Exclude<PlannerSource, "queued-placeholder">;
  latencyMs?: number;
  failureReason?: string | null;
  fallbackReason?: PlannerFallbackReason | null;
  completedAt?: number;
  dispatchToken?: string;
  dispatchStartedAt?: number;
  dispatchAttemptCount?: number;
  lastDispatchSource?: PlannerDispatchSource;
}

export interface TownPlannerState {
  queue: PlannerQueueEntry[];
  lastTickBudget: {
    tick: number;
    maxRequests: number;
    usedRequests: number;
    exhausted: boolean;
  } | null;
  metrics: {
    totalQueued: number;
    totalCompleted: number;
    totalFailed: number;
    totalFallbacks: number;
    placeholderAssignments: number;
    completedBySource: Partial<Record<Exclude<PlannerSource, "queued-placeholder">, number>>;
    queuedCount: number;
    dispatchingCount: number;
    lastDispatchAt?: number;
    lastDispatchStartedAt?: number;
    lastDispatchCompletedAt?: number;
    lastDispatchDurationMs?: number;
    lastDispatchSource?: PlannerDispatchSource;
    lastDispatchResult?: "success" | "partial" | "noop" | "failed";
    lastDispatchProcessed?: number;
    lastDispatchRemaining?: number;
    lastCompletionAt?: number;
    lastCompletionLatencyMs?: number;
    lastFailureAt?: number;
    lastFallbackReason?: PlannerFallbackReason | null;
  };
}

export interface TownState {
  id: string;
  name: string;
  seed: string;
  tick: number;
  now: number;
  owner: TownOwner;
  map: {
    width: number;
    height: number;
    tileSize: number;
  };
  locations: TownLocation[];
  npcs: Record<string, NpcState>;
  events: TownEvent[];
  metadata: {
    source: "mock" | "convex";
    tokenSummary: string | null;
    createdFrom: "seed" | "profile";
    planner?: TownPlannerState;
  };
}

export interface NpcEnvironment {
  tick: number;
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  nearby: {
    home?: TownLocation;
    field?: TownLocation;
    food?: TownLocation;
    market?: TownLocation;
    plaza?: TownLocation;
    workshop?: TownLocation;
    people: NpcSummary[];
    locations: TownLocation[];
  };
  distances: Record<string, number>;
  townMood: number;
}

export interface DecisionCandidate {
  type: DecisionCandidateType;
  base: number;
  target?: DecisionTarget;
  reason: string;
  prefersPlan?: boolean;
}

export interface ScoredDecisionCandidate {
  candidate: DecisionCandidate;
  score: number;
}

export interface DecisionWeights {
  hunger: number;
  energy: number;
  social: number;
  focus: number;
  proximityDecay: number;
  planThreshold: number;
  noise: number;
  role: Partial<Record<NpcRole, Partial<Record<DecisionCandidateType, number>>>>;
}

export interface WeightedDecisionBase {
  selected: DecisionCandidate;
  scoredCandidates: ScoredDecisionCandidate[];
}

export interface ImmediateActionDecision extends WeightedDecisionBase {
  decision: "immediate_action";
  action: NpcAction;
}

export interface PlanRequiredDecision extends WeightedDecisionBase {
  decision: "plan_required";
  planIntent: PlanIntent;
}

export type WeightedDecisionResult = ImmediateActionDecision | PlanRequiredDecision;

export interface PlannerRequest {
  townId: string;
  callerLogin?: string | null;
  tick: number;
  npc: NpcState;
  env: NpcEnvironment;
  intent: PlanIntent;
  now: number;
  rng?: RandomSource;
}

export interface PlannerResult {
  plan: NpcPlan;
  prompt: string;
  source: PlannerSource;
  latencyMs: number;
  fallbackReason?: PlannerFallbackReason;
  failureReason?: string | null;
}

export interface TickNpcResult {
  npcId: string;
  npcName: string;
  actionStarted?: NpcAction | null;
  actionCompleted?: NpcAction | null;
  assignedPlanId?: string;
  decision?: WeightedDecisionResult;
  notes: string[];
}

export interface SimulationTickSummary {
  processedNpcs: number;
  actionsStarted: number;
  actionsCompleted: number;
  plansAssigned: number;
  planner: {
    requested: number;
    queuedRequests: number;
    fallbackCount: number;
    averageLatencyMs: number | null;
    sourceCounts: Partial<Record<PlannerSource, number>>;
  };
}

export interface SimulationTickResult {
  town: TownState;
  tick: number;
  summary: SimulationTickSummary;
  npcResults: TickNpcResult[];
  events: TownEvent[];
  mode: "mock-local" | "convex-hosted";
}
