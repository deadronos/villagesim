import type { DatabaseReader, DatabaseWriter } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { cloneTownState } from "../lib/mockData";
import type { TownState } from "../lib/types";

interface IndexedTownQuery {
  withIndex(
    indexName: string,
    applyIndex: (query: { eq: (field: string, value: string) => unknown }) => unknown,
  ): {
    unique: () => Promise<{ _id: Id<"towns">; town: TownState } | null>;
  };
}

function toConvexTownState(town: TownState): TownState {
  const cloned = cloneTownState(town);
  cloned.metadata.source = "convex";
  return cloned;
}

async function findTownRecord(db: DatabaseReader | DatabaseWriter, townId: string) {
  return (db.query("towns") as unknown as IndexedTownQuery)
    .withIndex("by_townId", (query: { eq: (field: string, value: string) => unknown }) => query.eq("townId", townId))
    .unique();
}

export async function readTownFromConvex(db: DatabaseReader, townId: string): Promise<TownState | null> {
  const record = await findTownRecord(db, townId);
  return record ? toConvexTownState(record.town as TownState) : null;
}

export async function writeTownToConvex(db: DatabaseWriter, town: TownState): Promise<TownState> {
  const normalizedTown = toConvexTownState(town);
  const payload = {
    townId: normalizedTown.id,
    ownerLogin: normalizedTown.owner.login,
    createdFrom: normalizedTown.metadata.createdFrom,
    town: normalizedTown,
    updatedAt: normalizedTown.now,
  };
  const existing = await findTownRecord(db, normalizedTown.id);

  if (existing) {
    await db.patch(existing._id, payload);
  } else {
    await db.insert("towns", payload);
  }

  return toConvexTownState(normalizedTown);
}
