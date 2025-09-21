import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  integer,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table - required for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - required for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  username: varchar("username").notNull().unique(),
  bio: varchar("bio"),
  profileImageUrl: varchar("profile_image_url"),
  isProfilePublic: boolean("is_profile_public").default(true),
  // Privacy controls for profile information visibility to connections
  firstNameVisible: boolean("first_name_visible").default(true),
  lastNameVisible: boolean("last_name_visible").default(true),
  emailVisible: boolean("email_visible").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_users_username").on(table.username),
  index("idx_users_is_profile_public").on(table.isProfilePublic),
]);

// Journal entries table
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }),
    content: text("content").notNull(),
    audioUrl: varchar("audio_url"),
    audioPlayable: boolean("audio_playable").default(false),
    mediaUrls: text("media_urls").array().default([]),
    mediaObjects: jsonb("media_objects").$type<MediaObject[]>().default([]),
    tags: text("tags").array().default([]),
    privacy: varchar("privacy", { enum: ["private", "shared", "public"] }).default("private"),
    sharedWith: text("shared_with").array().default([]), // User IDs
    aiInsights: jsonb("ai_insights").$type<{
      summary: string;
      keywords: string[];
      entities: string[];
      labels: string[];
      people: string[];
      sentiment?: 'positive' | 'neutral' | 'negative';
      themes?: string[];
      emotions?: string[];
    }>(),
    // Vector embeddings for semantic search using OpenAI text-embedding-3-large (1536 dimensions)
    contentEmbedding: text("content_embedding"), // Store as text for now, will be cast to vector
    embeddingVersion: varchar("embedding_version").default("v1"), // Track embedding model version
    lastEmbeddingUpdate: timestamp("last_embedding_update"),
    // Consolidated text content for embedding (combines title, content, transcriptions, captions)
    searchableText: text("searchable_text"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_journal_entries_user_id").on(table.userId),
    index("idx_journal_entries_created_at").on(table.createdAt),
    index("idx_journal_entries_privacy").on(table.privacy),
  ]
);

// User mentions in journal entries
export const journalMentions = pgTable(
  "journal_mentions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    entryId: varchar("entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
    mentionedUserId: varchar("mentioned_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_journal_mentions_entry_id").on(table.entryId),
    index("idx_journal_mentions_user_id").on(table.mentionedUserId),
  ]
);

// User follows/connections for sharing
export const userConnections = pgTable(
  "user_connections",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    requesterId: varchar("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    recipientId: varchar("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { enum: ["pending", "accepted", "blocked"] }).notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_user_connections_requester").on(table.requesterId),
    index("idx_user_connections_recipient").on(table.recipientId),
    index("idx_user_connections_status").on(table.status),
    // Bidirectional unique constraint to prevent duplicate connections in either direction
    // unique("unique_bidirectional_connection").on(table.requesterId, table.recipientId), // Temporarily commented for schema push
    // Prevent self-connections
    // Note: This would need a CHECK constraint in actual PostgreSQL: CHECK (requester_id != recipient_id)
  ]
);

// AI chat conversations about journal entries
export const aiChatSessions = pgTable(
  "ai_chat_sessions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }),
    messages: jsonb("messages").notNull().default([]),
    relatedEntryIds: text("related_entry_ids").array().default([]),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_ai_chat_sessions_user_id").on(table.userId),
    index("idx_ai_chat_sessions_created_at").on(table.createdAt),
  ]
);

// Comments on journal entries
export const comments = pgTable(
  "comments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    entryId: varchar("entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    mediaUrls: text("media_urls").array().default([]),
    mediaObjects: jsonb("media_objects").$type<MediaObject[]>().default([]),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_comments_entry_id").on(table.entryId),
    index("idx_comments_user_id").on(table.userId),
    index("idx_comments_created_at").on(table.createdAt),
  ]
);

// Likes on journal entries
export const likes = pgTable(
  "likes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    entryId: varchar("entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_likes_entry_id").on(table.entryId),
    index("idx_likes_user_id").on(table.userId),
    // Prevent duplicate likes from same user on same entry
    unique("unique_user_entry_like").on(table.entryId, table.userId),
  ]
);

// People that users want to tag in their journal entries
export const people = pgTable(
  "people",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_people_user_id").on(table.userId),
    index("idx_people_first_name").on(table.firstName),
    // Ensure unique person names per user
    unique("unique_user_person_name").on(table.userId, table.firstName, table.lastName),
  ]
);

// Association table for tagging people in journal entries
export const entryPersonTags = pgTable(
  "entry_person_tags",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    entryId: varchar("entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
    personId: varchar("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_entry_person_tags_entry_id").on(table.entryId),
    index("idx_entry_person_tags_person_id").on(table.personId),
    // Prevent duplicate tags of same person in same entry
    unique("unique_entry_person_tag").on(table.entryId, table.personId),
  ]
);

// Insert schemas for forms
export const insertJournalEntrySchema = createInsertSchema(journalEntries).omit({
  id: true,
  userId: true,
  aiInsights: true, // AI insights are populated by the server
  createdAt: true,
  updatedAt: true,
});

export const insertAiChatSessionSchema = createInsertSchema(aiChatSessions).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserConnectionSchema = createInsertSchema(userConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLikeSchema = createInsertSchema(likes).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertPersonSchema = createInsertSchema(people).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEntryPersonTagSchema = createInsertSchema(entryPersonTags).omit({
  id: true,
  createdAt: true,
});

export const updateUserProfileSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial().extend({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be less than 20 characters")  
    .regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores")
    .transform(val => val.toLowerCase().trim())
    .optional()
});

// Types for TypeScript
export type MediaObject = {
  url: string;
  mimeType: string;
  originalName?: string;
};

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntries.$inferSelect;

export type InsertAiChatSession = z.infer<typeof insertAiChatSessionSchema>;
export type AiChatSession = typeof aiChatSessions.$inferSelect;

export type InsertUserConnection = z.infer<typeof insertUserConnectionSchema>;
export type UserConnection = typeof userConnections.$inferSelect;

export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

export type InsertLike = z.infer<typeof insertLikeSchema>;
export type Like = typeof likes.$inferSelect;

export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof people.$inferSelect;

export type InsertEntryPersonTag = z.infer<typeof insertEntryPersonTagSchema>;
export type EntryPersonTag = typeof entryPersonTags.$inferSelect;

export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;

export type JournalMention = typeof journalMentions.$inferSelect;

// Extended types with relations
export type JournalEntryWithUser = JournalEntry & {
  user: User;
  mentions?: (JournalMention & { user: User })[];
  personTags?: (EntryPersonTag & { person: Person })[];
  likeCount?: number;
  isLikedByUser?: boolean;
};

export type PersonWithTagCount = Person & {
  tagCount?: number;
};

export type CommentWithUser = Comment & {
  user: User;
};

export type CommentWithPublicUser = Comment & {
  user: PublicUser;
};

export type UserConnectionWithUser = UserConnection & {
  requester: User;
  recipient: User;
};

// Public-safe DTO types (omit sensitive fields)
export type PublicUser = {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  profileImageUrl: string | null;
  publicEntriesCount?: number;
  // Note: Privacy controls are handled server-side before creating PublicUser objects
};

export type PublicJournalEntry = {
  id: string;
  userId: string;
  title: string | null;
  content: string;
  audioUrl: string | null;
  audioPlayable: boolean;
  mediaUrls: string[];
  mediaObjects: MediaObject[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  user: PublicUser;
};

export type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  relatedEntryIds?: string[];
};

// AI insights type for journal entries (enhanced with multimodal capabilities)
export type AiInsights = {
  summary: string;
  keywords: string[];
  entities: string[];
  labels: string[];
  people: string[]; // People detected in images or general references
  sentiment?: 'positive' | 'neutral' | 'negative';
  // Enhanced fields for deeper analysis
  themes?: string[];
  emotions?: string[];
  // Person name detection for tagging system
  mentionedPeople?: string[]; // Specific person names mentioned in text content
};