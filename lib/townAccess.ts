import type { TownState } from "./types";

export class TownAccessError extends Error {}

export function isTownAccessError(error: unknown): error is TownAccessError {
  if (error instanceof TownAccessError) {
    return true;
  }

  return (
    error instanceof Error &&
    /Town .* belongs to @.* Sign in as that user to (read|change) it\./.test(error.message)
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
