import { query, mutation, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const listForWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      _creationTime: v.float64(),
      workspaceId: v.id("workspaces"),
      authorId: v.id("users"),
      body: v.string(),
      tags: v.optional(v.array(v.string())),
    }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    return await ctx.db
      .query("messages")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const send = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    authorId: v.id("users"),
    body: v.string(),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    return await ctx.db.insert("messages", args);
  },
});

export const enrichMessage = action({
  args: {
    messageId: v.id("messages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const embedding = new Array(1536).fill(0);

    await ctx.runMutation(internal.messages.applyEmbedding, {
      messageId: args.messageId,
      embedding,
    });

    return null;
  },
});

export const applyEmbedding = internalMutation({
  args: {
    messageId: v.id("messages"),
    embedding: v.array(v.float64()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { embedding: args.embedding });
    return null;
  },
});
