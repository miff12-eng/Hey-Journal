import { 
  type User, 
  type UpsertUser,
  type JournalEntry,
  type InsertJournalEntry,
  type JournalEntryWithUser,
  type AiChatSession,
  type InsertAiChatSession,
  type AiChatMessage,
  type PublicUser,
  type PublicJournalEntry,
  type AiInsights
} from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, desc, and, ilike, or, sql } from "drizzle-orm";
import { users, journalEntries, aiChatSessions } from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  searchUsers(query: string, limit?: number): Promise<User[]>;
  
  // Journal entry methods
  getJournalEntry(id: string): Promise<JournalEntry | undefined>;
  getJournalEntriesByUserId(userId: string, limit?: number): Promise<JournalEntryWithUser[]>;
  createJournalEntry(entry: InsertJournalEntry, userId: string): Promise<JournalEntry>;
  updateJournalEntry(id: string, entry: Partial<InsertJournalEntry>): Promise<JournalEntry>;
  updateAiInsights(entryId: string, insights: AiInsights | null): Promise<JournalEntry>;
  deleteJournalEntry(id: string): Promise<void>;
  
  // AI Chat methods
  getAiChatSession(id: string): Promise<AiChatSession | undefined>;
  getAiChatSessionsByUserId(userId: string): Promise<AiChatSession[]>;
  createAiChatSession(session: InsertAiChatSession, userId: string): Promise<AiChatSession>;
  updateAiChatSession(id: string, updates: Partial<{ messages: AiChatMessage[]; updatedAt: Date }>): Promise<AiChatSession>;
  
  // Public-facing methods (no authentication required)
  getPublicUserByUsername(username: string): Promise<PublicUser | undefined>;
  searchPublicUsers(query: string, limit?: number): Promise<PublicUser[]>;
  getPublicEntriesByUserId(userId: string, limit?: number, cursor?: string): Promise<PublicJournalEntry[]>;
  getPublicEntryById(id: string): Promise<PublicJournalEntry | undefined>;
  searchPublicEntries(query: string, limit?: number, cursor?: string): Promise<PublicJournalEntry[]>;
}

// Database storage using PostgreSQL
class DbStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;
  
  constructor() {
    const sql = neon(process.env.DATABASE_URL!);
    this.db = drizzle(sql);
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async createUser(insertUser: UpsertUser): Promise<User> {
    const result = await this.db.insert(users).values({
      id: insertUser.id || randomUUID(),
      email: insertUser.email,
      firstName: insertUser.firstName,
      lastName: insertUser.lastName,
      profileImageUrl: insertUser.profileImageUrl,
      createdAt: insertUser.createdAt || new Date(),
      updatedAt: insertUser.updatedAt || new Date(),
    }).returning();
    return result[0];
  }

  async searchUsers(query: string, limit = 10): Promise<User[]> {
    const result = await this.db
      .select()
      .from(users)
      .where(
        or(
          ilike(users.email, `%${query}%`),
          ilike(users.firstName, `%${query}%`),
          ilike(users.lastName, `%${query}%`),
          ilike(users.username, `%${query}%`)
        )
      )
      .limit(limit);
    return result;
  }

  async getJournalEntry(id: string): Promise<JournalEntry | undefined> {
    const result = await this.db.select().from(journalEntries).where(eq(journalEntries.id, id));
    return result[0];
  }

  async getJournalEntriesByUserId(userId: string, limit = 20): Promise<JournalEntryWithUser[]> {
    console.log('🗂️ [DB] Fetching entries for userId:', userId);
    
    const result = await this.db
      .select({
        // Journal entry fields
        id: journalEntries.id,
        userId: journalEntries.userId,
        title: journalEntries.title,
        content: journalEntries.content,
        audioUrl: journalEntries.audioUrl,
        mediaUrls: journalEntries.mediaUrls,
        tags: journalEntries.tags,
        privacy: journalEntries.privacy,
        sharedWith: journalEntries.sharedWith,
        aiInsights: journalEntries.aiInsights,
        createdAt: journalEntries.createdAt,
        updatedAt: journalEntries.updatedAt,
        // User fields
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userProfileImageUrl: users.profileImageUrl,
        userCreatedAt: users.createdAt,
        userUpdatedAt: users.updatedAt,
      })
      .from(journalEntries)
      .leftJoin(users, eq(journalEntries.userId, users.id))
      .where(eq(journalEntries.userId, userId))
      .orderBy(desc(journalEntries.createdAt))
      .limit(limit);

    console.log('🗂️ [DB] Found', result.length, 'entries');
    
    const entriesWithUser: JournalEntryWithUser[] = result.map((row) => ({
      id: row.id,
      userId: row.userId,
      title: row.title,
      content: row.content,
      audioUrl: row.audioUrl,
      mediaUrls: row.mediaUrls || [],
      tags: row.tags || [],
      privacy: row.privacy as "private" | "shared" | "public",
      sharedWith: row.sharedWith || [],
      aiInsights: row.aiInsights,
      createdAt: row.createdAt!,
      updatedAt: row.updatedAt!,
      user: {
        id: row.userId,
        email: row.userEmail!,
        firstName: row.userFirstName!,
        lastName: row.userLastName!,
        profileImageUrl: row.userProfileImageUrl,
        createdAt: row.userCreatedAt!,
        updatedAt: row.userUpdatedAt!,
      }
    }));

    return entriesWithUser;
  }

  async createJournalEntry(entryData: InsertJournalEntry, userId: string): Promise<JournalEntry> {
    console.log('🗂️ [DB] Creating entry for userId:', userId);
    const result = await this.db.insert(journalEntries).values({
      id: randomUUID(),
      userId,
      title: entryData.title,
      content: entryData.content,
      audioUrl: entryData.audioUrl,
      mediaUrls: entryData.mediaUrls || [],
      tags: entryData.tags || [],
      privacy: entryData.privacy || "private",
      sharedWith: entryData.sharedWith || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    
    console.log('🗂️ [DB] Created entry:', result[0].id);
    return result[0];
  }

  async updateJournalEntry(id: string, updates: Partial<InsertJournalEntry>): Promise<JournalEntry> {
    const result = await this.db
      .update(journalEntries)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(journalEntries.id, id))
      .returning();
    
    if (!result[0]) {
      throw new Error('Journal entry not found');
    }
    return result[0];
  }

  async updateAiInsights(entryId: string, insights: AiInsights | null): Promise<JournalEntry> {
    const result = await this.db
      .update(journalEntries)
      .set({ aiInsights: insights, updatedAt: new Date() })
      .where(eq(journalEntries.id, entryId))
      .returning();
    
    if (!result[0]) {
      throw new Error('Journal entry not found');
    }
    return result[0];
  }

  async deleteJournalEntry(id: string): Promise<void> {
    await this.db.delete(journalEntries).where(eq(journalEntries.id, id));
  }

  async getAiChatSession(id: string): Promise<AiChatSession | undefined> {
    const result = await this.db.select().from(aiChatSessions).where(eq(aiChatSessions.id, id));
    return result[0];
  }

  async getAiChatSessionsByUserId(userId: string): Promise<AiChatSession[]> {
    const result = await this.db
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.userId, userId))
      .orderBy(desc(aiChatSessions.updatedAt));
    
    return result;
  }

  async createAiChatSession(sessionData: InsertAiChatSession, userId: string): Promise<AiChatSession> {
    const result = await this.db.insert(aiChatSessions).values({
      id: randomUUID(),
      userId,
      title: sessionData.title,
      messages: sessionData.messages || [],
      relatedEntryIds: sessionData.relatedEntryIds || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    
    return result[0];
  }

  async updateAiChatSession(id: string, updates: Partial<{ messages: AiChatMessage[]; updatedAt: Date }>): Promise<AiChatSession> {
    const result = await this.db
      .update(aiChatSessions)
      .set({ ...updates, updatedAt: updates.updatedAt || new Date() })
      .where(eq(aiChatSessions.id, id))
      .returning();
    
    if (!result[0]) {
      throw new Error('AI chat session not found');
    }
    return result[0];
  }

  // Public-facing methods (no authentication required)
  async getPublicUserByUsername(username: string): Promise<PublicUser | undefined> {
    const result = await this.db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        bio: users.bio,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .where(and(eq(users.username, username), eq(users.isProfilePublic, true)));
    
    if (!result[0]) return undefined;
    
    // Get public entries count using proper SQL COUNT
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(journalEntries)
      .where(and(eq(journalEntries.userId, result[0].id), eq(journalEntries.privacy, 'public')));
    
    return {
      ...result[0],
      username: result[0].username!, // Assert non-null for public profiles
      publicEntriesCount: countResult[0]?.count || 0
    };
  }

  async searchPublicUsers(query: string, limit = 20): Promise<PublicUser[]> {
    const result = await this.db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        bio: users.bio,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .where(and(
        eq(users.isProfilePublic, true),
        or(
          ilike(users.username, `%${query}%`),
          ilike(users.firstName, `%${query}%`),
          ilike(users.lastName, `%${query}%`),
          ilike(users.bio, `%${query}%`)
        )
      ))
      .limit(limit);
    
    return result.map(user => ({
      ...user,
      username: user.username!, // Assert non-null for public profiles  
      publicEntriesCount: 0 // TODO: Could optimize with subquery
    }));
  }

  async getPublicEntriesByUserId(userId: string, limit = 20, cursor?: string): Promise<PublicJournalEntry[]> {
    let whereConditions = and(
      eq(journalEntries.userId, userId),
      eq(journalEntries.privacy, 'public')
    );
    
    if (cursor) {
      const cursorDate = new Date(cursor);
      whereConditions = and(whereConditions, sql`${journalEntries.createdAt} < ${cursorDate}`);
    }

    const result = await this.db
      .select({
        id: journalEntries.id,
        userId: journalEntries.userId,
        title: journalEntries.title,
        content: journalEntries.content,
        audioUrl: journalEntries.audioUrl,
        mediaUrls: journalEntries.mediaUrls,
        tags: journalEntries.tags,
        createdAt: journalEntries.createdAt,
        updatedAt: journalEntries.updatedAt,
        // User fields with privacy check
        userUsername: users.username,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userBio: users.bio,
        userProfileImageUrl: users.profileImageUrl,
        userIsProfilePublic: users.isProfilePublic,
      })
      .from(journalEntries)
      .leftJoin(users, eq(journalEntries.userId, users.id))
      .where(whereConditions)
      .orderBy(desc(journalEntries.createdAt))
      .limit(limit);

    return result.map(row => {
      const isProfilePublic = row.userIsProfilePublic === true;
      
      return {
        id: row.id,
        userId: row.userId,
        title: row.title,
        content: row.content,
        audioUrl: row.audioUrl,
        mediaUrls: row.mediaUrls || [],
        tags: row.tags || [],
        createdAt: row.createdAt!,
        updatedAt: row.updatedAt!,
        user: {
          id: row.userId,
          username: row.userUsername!,
          // Only expose profile details if user profile is public
          firstName: isProfilePublic ? row.userFirstName : null,
          lastName: isProfilePublic ? row.userLastName : null,
          bio: isProfilePublic ? row.userBio : null,
          profileImageUrl: isProfilePublic ? row.userProfileImageUrl : null,
        }
      };
    });
  }

  async getPublicEntryById(id: string): Promise<PublicJournalEntry | undefined> {
    const result = await this.db
      .select({
        id: journalEntries.id,
        userId: journalEntries.userId,
        title: journalEntries.title,
        content: journalEntries.content,
        audioUrl: journalEntries.audioUrl,
        mediaUrls: journalEntries.mediaUrls,
        tags: journalEntries.tags,
        createdAt: journalEntries.createdAt,
        updatedAt: journalEntries.updatedAt,
        // User fields with privacy check
        userUsername: users.username,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userBio: users.bio,
        userProfileImageUrl: users.profileImageUrl,
        userIsProfilePublic: users.isProfilePublic,
      })
      .from(journalEntries)
      .leftJoin(users, eq(journalEntries.userId, users.id))
      .where(and(eq(journalEntries.id, id), eq(journalEntries.privacy, 'public')));

    if (!result[0]) return undefined;

    const row = result[0];
    const isProfilePublic = row.userIsProfilePublic === true;
    
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      content: row.content,
      audioUrl: row.audioUrl,
      mediaUrls: row.mediaUrls || [],
      tags: row.tags || [],
      createdAt: row.createdAt!,
      updatedAt: row.updatedAt!,
      user: {
        id: row.userId,
        username: row.userUsername!,
        // Only expose profile details if user profile is public
        firstName: isProfilePublic ? row.userFirstName : null,
        lastName: isProfilePublic ? row.userLastName : null,
        bio: isProfilePublic ? row.userBio : null,
        profileImageUrl: isProfilePublic ? row.userProfileImageUrl : null,
      }
    };
  }

  async searchPublicEntries(query: string, limit = 20, cursor?: string): Promise<PublicJournalEntry[]> {
    let whereConditions = and(
      eq(journalEntries.privacy, 'public'),
      or(
        ilike(journalEntries.title, `%${query}%`),
        ilike(journalEntries.content, `%${query}%`)
      )
    );
    
    if (cursor) {
      const cursorDate = new Date(cursor);
      whereConditions = and(whereConditions, sql`${journalEntries.createdAt} < ${cursorDate}`);
    }

    const result = await this.db
      .select({
        id: journalEntries.id,
        userId: journalEntries.userId,
        title: journalEntries.title,
        content: journalEntries.content,
        audioUrl: journalEntries.audioUrl,
        mediaUrls: journalEntries.mediaUrls,
        tags: journalEntries.tags,
        createdAt: journalEntries.createdAt,
        updatedAt: journalEntries.updatedAt,
        // User fields with privacy check
        userUsername: users.username,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userBio: users.bio,
        userProfileImageUrl: users.profileImageUrl,
        userIsProfilePublic: users.isProfilePublic,
      })
      .from(journalEntries)
      .leftJoin(users, eq(journalEntries.userId, users.id))
      .where(whereConditions)
      .orderBy(desc(journalEntries.createdAt))
      .limit(limit);

    return result.map(row => {
      const isProfilePublic = row.userIsProfilePublic === true;
      
      return {
        id: row.id,
        userId: row.userId,
        title: row.title,
        content: row.content,
        audioUrl: row.audioUrl,
        mediaUrls: row.mediaUrls || [],
        tags: row.tags || [],
        createdAt: row.createdAt!,
        updatedAt: row.updatedAt!,
        user: {
          id: row.userId,
          username: row.userUsername!,
          // Only expose profile details if user profile is public
          firstName: isProfilePublic ? row.userFirstName : null,
          lastName: isProfilePublic ? row.userLastName : null,
          bio: isProfilePublic ? row.userBio : null,
          profileImageUrl: isProfilePublic ? row.userProfileImageUrl : null,
        }
      };
    });
  }
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private journalEntries: Map<string, JournalEntry>;
  private aiChatSessions: Map<string, AiChatSession>;

  constructor() {
    this.users = new Map();
    this.journalEntries = new Map();
    this.aiChatSessions = new Map();
    
    // Create a mock user for development
    this.createMockUser();
  }

  private async createMockUser() {
    const mockUser: User = {
      id: 'mock-user-id',
      email: 'user@example.com',
      firstName: 'Demo',
      lastName: 'User',
      username: 'demouser',
      bio: 'Demo user for testing journal app',
      profileImageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
      isProfilePublic: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(mockUser.id, mockUser);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: UpsertUser): Promise<User> {
    const id = insertUser.id || randomUUID();
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id,
      createdAt: insertUser.createdAt || now,
      updatedAt: insertUser.updatedAt || now
    };
    this.users.set(id, user);
    return user;
  }

  async getJournalEntry(id: string): Promise<JournalEntry | undefined> {
    return this.journalEntries.get(id);
  }

  async getJournalEntriesByUserId(userId: string, limit = 20): Promise<JournalEntryWithUser[]> {
    const allEntries = Array.from(this.journalEntries.values());
    console.log('🗂️ Total entries in storage:', allEntries.length);
    console.log('🗂️ Looking for userId:', userId);
    
    if (allEntries.length > 0) {
      console.log('🗂️ Sample entry userIds:', allEntries.slice(0, 3).map(e => e.userId));
    }
    
    const entries = allEntries
      .filter(entry => entry.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);

    console.log('🗂️ Filtered entries for user:', entries.length);

    const entriesWithUser: JournalEntryWithUser[] = [];
    for (const entry of entries) {
      const user = await this.getUser(entry.userId);
      console.log('🗂️ User found for entry:', !!user, entry.id);
      if (user) {
        entriesWithUser.push({ ...entry, user });
      }
    }
    
    console.log('🗂️ Final entries with user:', entriesWithUser.length);
    return entriesWithUser;
  }

  async createJournalEntry(entryData: InsertJournalEntry, userId: string): Promise<JournalEntry> {
    const id = randomUUID();
    const now = new Date();
    const entry: JournalEntry = {
      ...entryData,
      id,
      userId,
      mediaUrls: entryData.mediaUrls || [],
      tags: entryData.tags || [],
      sharedWith: entryData.sharedWith || [],
      aiInsights: null, // Will be populated by AI analysis
      createdAt: now,
      updatedAt: now
    };
    
    this.journalEntries.set(id, entry);
    return entry;
  }

  async updateJournalEntry(id: string, updates: Partial<InsertJournalEntry>): Promise<JournalEntry> {
    const existing = this.journalEntries.get(id);
    if (!existing) {
      throw new Error('Journal entry not found');
    }
    
    const updated: JournalEntry = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };
    
    this.journalEntries.set(id, updated);
    return updated;
  }

  async updateAiInsights(entryId: string, insights: AiInsights | null): Promise<JournalEntry> {
    const existing = this.journalEntries.get(entryId);
    if (!existing) {
      throw new Error('Journal entry not found');
    }
    
    const updated: JournalEntry = {
      ...existing,
      aiInsights: insights,
      updatedAt: new Date()
    };
    
    this.journalEntries.set(entryId, updated);
    return updated;
  }

  async deleteJournalEntry(id: string): Promise<void> {
    this.journalEntries.delete(id);
  }

  async getAiChatSession(id: string): Promise<AiChatSession | undefined> {
    return this.aiChatSessions.get(id);
  }

  async getAiChatSessionsByUserId(userId: string): Promise<AiChatSession[]> {
    return Array.from(this.aiChatSessions.values())
      .filter(session => session.userId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async createAiChatSession(sessionData: InsertAiChatSession, userId: string): Promise<AiChatSession> {
    const id = randomUUID();
    const now = new Date();
    const session: AiChatSession = {
      ...sessionData,
      id,
      userId,
      messages: sessionData.messages || [],
      relatedEntryIds: sessionData.relatedEntryIds || [],
      createdAt: now,
      updatedAt: now
    };
    
    this.aiChatSessions.set(id, session);
    return session;
  }

  async updateAiChatSession(id: string, updates: Partial<{ messages: AiChatMessage[]; updatedAt: Date }>): Promise<AiChatSession> {
    const existing = this.aiChatSessions.get(id);
    if (!existing) {
      throw new Error('AI chat session not found');
    }
    
    const updated: AiChatSession = {
      ...existing,
      ...updates,
      updatedAt: updates.updatedAt || new Date()
    };
    
    this.aiChatSessions.set(id, updated);
    return updated;
  }

  // Public-facing methods (not implemented for MemStorage - use DbStorage for public features)
  async getPublicUserByUsername(username: string): Promise<PublicUser | undefined> {
    throw new Error('Public methods not implemented in MemStorage - use DbStorage');
  }

  async searchPublicUsers(query: string, limit?: number): Promise<PublicUser[]> {
    throw new Error('Public methods not implemented in MemStorage - use DbStorage');
  }

  async getPublicEntriesByUserId(userId: string, limit?: number, cursor?: string): Promise<PublicJournalEntry[]> {
    throw new Error('Public methods not implemented in MemStorage - use DbStorage');
  }

  async getPublicEntryById(id: string): Promise<PublicJournalEntry | undefined> {
    throw new Error('Public methods not implemented in MemStorage - use DbStorage');
  }

  async searchPublicEntries(query: string, limit?: number, cursor?: string): Promise<PublicJournalEntry[]> {
    throw new Error('Public methods not implemented in MemStorage - use DbStorage');
  }
}

export const storage = new DbStorage();
