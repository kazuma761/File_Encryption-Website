import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

export const storeFile = mutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
    isEncrypted: v.boolean(),
    originalName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    return await ctx.db.insert("files", {
      userId,
      storageId: args.storageId,
      name: args.name,
      isEncrypted: args.isEncrypted,
      originalName: args.originalName,
    });
  },
});

export const listFiles = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const files = await ctx.db
      .query("files")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Filter out files that don't have valid URLs
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        const url = await ctx.storage.getUrl(file.storageId);
        return url ? { ...file, url } : null;
      })
    );

    // Remove null entries
    return filesWithUrls.filter((file): file is NonNullable<typeof file> => file !== null);
  },
});

export const deleteFile = mutation({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const file = await ctx.db.get(args.fileId);
    if (!file || file.userId !== userId) throw new Error("File not found");

    await ctx.storage.delete(file.storageId);
    await ctx.db.delete(args.fileId);
  },
});

export const getFile = query({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const file = await ctx.db.get(args.fileId);
    if (!file || file.userId !== userId) return null;

    const url = await ctx.storage.getUrl(file.storageId);
    if (!url) return null;

    return { ...file, url };
  },
});

// Add "use node" directive for Node.js crypto functionality
"use node";

export const processFile = action({
  args: {
    fileId: v.id("files"),
    password: v.string(),
    operation: v.union(v.literal("encrypt"), v.literal("decrypt")),
  },
  handler: async (ctx, args) => {
    const file = await ctx.runQuery(api.files.getFile, { fileId: args.fileId });
    if (!file || !file.url) throw new Error("File not found");

    const response = await fetch(file.url);
    if (!response.ok) throw new Error("Failed to fetch file");
    
    const data = await response.arrayBuffer();
    const text = new TextDecoder().decode(data);

    const CryptoJS = (await import("crypto-js")).default;
    let result: string;

    try {
      if (args.operation === "encrypt") {
        // Generate a secure key from the password using SHA-256
        const key = CryptoJS.SHA256(args.password).toString();
        // Use AES encryption in CBC mode with the derived key
        result = CryptoJS.AES.encrypt(text, key, {
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7,
        }).toString();
      } else {
        // For decryption, derive the same key
        const key = CryptoJS.SHA256(args.password).toString();
        // Decrypt the content
        const decrypted = CryptoJS.AES.decrypt(text, key, {
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7,
        });
        result = decrypted.toString(CryptoJS.enc.Utf8);
        if (!result) throw new Error("Incorrect password or corrupted file");
      }
    } catch (error) {
      throw new Error("Encryption/decryption failed: " + (error as Error).message);
    }

    // Convert result back to ArrayBuffer
    const buffer = new TextEncoder().encode(result);

    // Generate upload URL and upload processed file
    const uploadUrl = await ctx.runMutation(api.files.generateUploadUrl, {});
    const upload = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: buffer,
    });
    
    if (!upload.ok) throw new Error("Failed to upload processed file");
    
    const { storageId } = await upload.json();
    
    // Store new file and delete old one
    await ctx.runMutation(api.files.storeFile, {
      storageId,
      name: `${file.originalName}${args.operation === "encrypt" ? ".enc" : ""}`,
      isEncrypted: args.operation === "encrypt",
      originalName: file.originalName,
    });
    
    await ctx.runMutation(api.files.deleteFile, { fileId: args.fileId });
  },
});
