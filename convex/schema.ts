import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  towns: defineTable({
    townId: v.string(),
    ownerLogin: v.string(),
    createdFrom: v.union(v.literal("seed"), v.literal("profile")),
    town: v.any(),
    updatedAt: v.number(),
  })
    .index("by_townId", ["townId"])
    .index("by_ownerLogin", ["ownerLogin"]),
});
