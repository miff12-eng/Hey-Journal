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
  username: varchar("username").unique(),
  bio: varchar("bio"),
  profileImageUrl: varchar("profile_image_url"),
  isProfilePublic: boolean("is_profile_public").default(true),
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
    mediaUrls: text("media_urls").array().default([]),
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
    }>(),
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
    followerId: varchar("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    followingId: varchar("following_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_user_connections_follower").on(table.followerId),
    index("idx_user_connections_following").on(table.followingId),
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
});

// Types for TypeScript
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntries.$inferSelect;

export type InsertAiChatSession = z.infer<typeof insertAiChatSessionSchema>;
export type AiChatSession = typeof aiChatSessions.$inferSelect;

export type InsertUserConnection = z.infer<typeof insertUserConnectionSchema>;
export type UserConnection = typeof userConnections.$inferSelect;

export type JournalMention = typeof journalMentions.$inferSelect;

// Extended types with relations
export type JournalEntryWithUser = JournalEntry & {
  user: User;
  mentions?: (JournalMention & { user: User })[];
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
};

export type PublicJournalEntry = {
  id: string;
  userId: string;
  title: string | null;
  content: string;
  audioUrl: string | null;
  mediaUrls: string[];
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

// AI insights type for journal entries
export type AiInsights = {
  summary: string;
  keywords: string[];
  entities: string[];
  labels: string[];
  people: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
};