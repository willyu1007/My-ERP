import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  workspaces: defineTable({
    slug: v.string(),
    name: v.string(),
    ownerId: v.id("users"),
  })
    .index("by_slug", ["slug"])
    .index("by_ownerId", ["ownerId"]),

  users: defineTable({
    tokenIdentifier: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_workspaceId", ["workspaceId"]),

  messages: defineTable({
    workspaceId: v.id("workspaces"),
    authorId: v.id("users"),
    body: v.string(),
    tags: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_authorId", ["authorId"])
    .searchIndex("search_body", {
      searchField: "body",
      filterFields: ["workspaceId"],
    })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["workspaceId"],
    }),
});
