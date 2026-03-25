import type { TownState } from "./types";

export class TownAccessError extends Error {
  code = "TOWN_ACCESS";

  constructor(message: string) {
    super(message);
    this.name = "TownAccessError";
  }
}

export function isTownAccessError(error: unknown): error is TownAccessError {
  if (error instanceof TownAccessError) {
    return true;
  }

  return (
    !!error &&
    typeof error === "object" &&
    ("code" in error
      ? error.code === "TOWN_ACCESS"
      : error instanceof Error &&
          error.message.includes("belongs to @") &&
          error.message.includes("Sign in as that user"))
  );
}

export function isProfileOwnedTown(town: Pick<TownState, "metadata">): boolean {
  return town.metadata.createdFrom === "profile";
}

export function canAccessTown(
  town: Pick<TownState, "owner" | "metadata" | "id">,
  callerLogin: string | null | undefined,
): boolean {
  if (!isProfileOwnedTown(town)) {
    return true;
  }

  return typeof callerLogin === "string" && callerLogin === town.owner.login;
}

export function assertCanReadTown(
  town: Pick<TownState, "owner" | "metadata" | "id">,
  callerLogin: string | null | undefined,
): void {
  if (!canAccessTown(town, callerLogin)) {
    throw new TownAccessError(`Town ${town.id} belongs to @${town.owner.login}. Sign in as that user to read it.`);
  }
}

export function assertCanWriteTown(
  town: Pick<TownState, "owner" | "metadata" | "id">,
  callerLogin: string | null | undefined,
): void {
  if (!canAccessTown(town, callerLogin)) {
    throw new TownAccessError(`Town ${town.id} belongs to @${town.owner.login}. Sign in as that user to change it.`);
  }
}
