import { CopilotClient, type AssistantMessageEvent, type CopilotClientOptions, type SessionConfig } from "@github/copilot-sdk";

import * as plannerContract from "../../../../lib/plannerContract";
import type { PlannerPayload, PlannerServiceRequest, PlannerServiceResponse } from "../../../../lib/plannerContract";
import { PlannerProviderError, type PlannerProvider } from "./base.js";

const DEFAULT_COPILOT_SYSTEM_MESSAGE = [
  "You are the private VillageSim planner runtime.",
  "Return only compact JSON for the planner payload.",
  "Do not emit markdown fences, tool traces, internal reasoning, or provider diagnostics.",
  'The response must validate as {"rationale":"string","plan":[...]} with 1 to 6 safe village actions.',
].join(" ");

const plannerContractModule = ("default" in plannerContract ? plannerContract.default : plannerContract) as typeof import("../../../../lib/plannerContract");
const { parsePlannerPayload, plannerServiceResponseSchema } = plannerContractModule;

export interface CopilotPlannerProviderConfig {
  cliPath?: string;
  cliUrl?: string | null;
  configDir?: string | null;
  logLevel?: "all" | "debug" | "error" | "info" | "none" | "warning";
  model: string;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  timeoutMs: number;
  workingDirectory: string;
}

export interface CopilotSessionLike {
  disconnect(): Promise<void>;
  sendAndWait(options: { mode?: "enqueue" | "immediate"; prompt: string }, timeout?: number): Promise<AssistantMessageEvent | undefined>;
}

export interface CopilotClientLike {
  createSession(config: SessionConfig): Promise<CopilotSessionLike>;
  start(): Promise<void>;
  stop(): Promise<Error[]>;
}

export type CopilotClientFactory = (options: CopilotClientOptions) => CopilotClientLike;

function denyAllPermissions() {
  return { kind: "denied-no-approval-rule-and-could-not-request-from-user" } as const;
}

function buildPrompt(request: PlannerServiceRequest): string {
  return [
    request.prompt,
    "Return only the planner JSON object. Do not include markdown, code fences, or any extra commentary.",
  ].join("\n\n");
}

function extractJsonCandidate(content: string): string {
  const fencedBlockMatch = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedBlockMatch?.[1]) {
    return fencedBlockMatch[1].trim();
  }

  const jsonBlockMatches = [...content.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  if (jsonBlockMatches.length === 1 && jsonBlockMatches[0]?.[1]) {
    return jsonBlockMatches[0][1].trim();
  }

  return content;
}

function parseAssistantContent(content: string): PlannerPayload {
  const directCandidate = content.trim();

  try {
    return parsePlannerPayload(directCandidate);
  } catch {
    const extractedCandidate = extractJsonCandidate(directCandidate);
    if (extractedCandidate !== directCandidate) {
      return parsePlannerPayload(extractedCandidate);
    }
  }

  throw new PlannerProviderError(502, "invalid_provider_response", "Copilot runtime returned invalid planner JSON.");
}

function normalizeProviderError(error: unknown): PlannerProviderError {
  if (error instanceof PlannerProviderError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "Copilot planner runtime failed.";
  if (/timed out|timeout/i.test(message)) {
    return new PlannerProviderError(504, "planner_provider_timeout", "Copilot planner runtime timed out.", { cause: error });
  }

  return new PlannerProviderError(502, "planner_provider_failed", "Copilot planner runtime failed.", { cause: error });
}

export class CopilotPlannerProvider implements PlannerProvider {
  readonly name = "copilot";

  constructor(
    private readonly config: CopilotPlannerProviderConfig,
    private readonly createClient: CopilotClientFactory = (options) => new CopilotClient(options),
  ) {}

  async plan(request: PlannerServiceRequest): Promise<PlannerServiceResponse> {
    const client = this.createClient(this.buildClientOptions());
    let session: CopilotSessionLike | null = null;

    try {
      await client.start();
      session = await client.createSession(this.buildSessionConfig());

      const assistantMessage = await session.sendAndWait(
        {
          mode: "immediate",
          prompt: buildPrompt(request),
        },
        this.config.timeoutMs,
      );
      const content = assistantMessage?.data.content?.trim();

      if (!content) {
        throw new PlannerProviderError(502, "invalid_provider_response", "Copilot runtime returned no assistant message.");
      }

      return plannerServiceResponseSchema.parse({
        requestId: request.metadata.requestId,
        plan: parseAssistantContent(content),
      });
    } catch (error) {
      throw normalizeProviderError(error);
    } finally {
      if (session) {
        try {
          await session.disconnect();
        } catch {
          // Ignore session cleanup errors after the planner response is already decided.
        }
      }

      try {
        await client.stop();
      } catch {
        // Ignore client cleanup errors to preserve the original planner outcome.
      }
    }
  }

  private buildClientOptions(): CopilotClientOptions {
    const options: CopilotClientOptions = {
      autoStart: false,
      logLevel: this.config.logLevel ?? "error",
      useLoggedInUser: true,
    };

    if (this.config.cliUrl) {
      options.cliUrl = this.config.cliUrl;
    } else {
      options.cliPath = this.config.cliPath ?? "copilot";
      options.useStdio = true;
    }

    return options;
  }

  private buildSessionConfig(): SessionConfig {
    return {
      availableTools: [],
      clientName: "villagesim-planner-service",
      configDir: this.config.configDir ?? undefined,
      infiniteSessions: { enabled: false },
      model: this.config.model,
      onPermissionRequest: denyAllPermissions,
      reasoningEffort: this.config.reasoningEffort,
      streaming: false,
      systemMessage: {
        content: DEFAULT_COPILOT_SYSTEM_MESSAGE,
      },
      workingDirectory: this.config.workingDirectory,
    };
  }
}
