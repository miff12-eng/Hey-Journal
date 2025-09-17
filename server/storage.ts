import { 
  type User, 
  type UpsertUser,
  type UpdateUserProfile,
  type JournalEntry,
  type InsertJournalEntry,
  type JournalEntryWithUser,
  type Comment,
  type InsertComment,
  type CommentWithUser,
  type CommentWithPublicUser,
  type UserConnection,
  type UserConnectionWithUser,
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
import { eq, desc, and, ilike, or, sql, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { users, journalEntries, comments, aiChatSessions, userConnections } from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>; // Required for OAuth authentication
  updateUserProfile(id: string, updates: UpdateUserProfile): Promise<User>;
  searchUsers(query: string, limit?: number): Promise<User[]>;
  
  // Journal entry methods
  getJournalEntry(id: string): Promise<JournalEntry | undefined>;
  getJournalEntriesByUserId(userId: string, limit?: number): Promise<JournalEntryWithUser[]>;
  getFeedJournalEntries(userId: string, limit?: number): Promise<JournalEntryWithUser[]>;
  getSharedJournalEntries(userId: string, limit?: number): Promise<JournalEntryWithUser[]>;
  createJournalEntry(entry: InsertJournalEntry, userId: string): Promise<JournalEntry>;
  updateJournalEntry(id: string, entry: Partial<InsertJournalEntry>): Promise<JournalEntry>;
  updateAiInsights(entryId: string, insights: AiInsights | null): Promise<JournalEntry>;
  deleteJournalEntry(id: string): Promise<void>;
  
  // AI Chat methods
  getAiChatSession(id: string): Promise<AiChatSession | undefined>;
  getAiChatSessionsByUserId(userId: string): Promise<AiChatSession[]>;
  createAiChatSession(session: InsertAiChatSession, userId: string): Promise<AiChatSession>;
  updateAiChatSession(id: string, updates: Partial<{ messages: AiChatMessage[]; updatedAt: Date }>): Promise<AiChatSession>;
  
  // Comment methods
  getComment(id: string): Promise<Comment | undefined>;
  getCommentsByEntryId(entryId: string): Promise<CommentWithUser[]>;
  getCommentsByEntryIdPublic(entryId: string): Promise<CommentWithPublicUser[]>;
  createComment(comment: InsertComment, userId: string): Promise<Comment>;
  updateComment(id: string, updates: Partial<InsertComment>): Promise<Comment>;
  deleteComment(id: string): Promise<void>;
  
  // Connection methods
  sendConnectionRequest(requesterId: string, recipientId: string): Promise<UserConnection>;
  acceptConnectionRequest(requestId: string, userId: string): Promise<UserConnection>;
  rejectConnectionRequest(requestId: string, userId: string): Promise<void>;
  blockUser(requesterId: string, recipientId: string): Promise<UserConnection>;
  unblockUser(requesterId: string, recipientId: string): Promise<void>;
  getConnectionRequests(userId: string, type: 'received' | 'sent'): Promise<UserConnectionWithUser[]>;
  getConnections(userId: string): Promise<UserConnectionWithUser[]>;
  getConnectionStatus(requesterId: string, recipientId: string): Promise<UserConnection | undefined>;
  
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

  async updateUserProfile(id: string, updates: UpdateUserProfile): Promise<User> {
    const result = await this.db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    
    if (!result[0]) {
      throw new Error('User not found');
    }
    return result[0];
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await this.db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
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
        audioPlayable: journalEntries.audioPlayable,
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
        userUsername: users.username,
        userBio: users.bio,
        userProfileImageUrl: users.profileImageUrl,
        userIsProfilePublic: users.isProfilePublic,
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
      audioPlayable: row.audioPlayable,
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
        username: row.userUsername,
        bio: row.userBio,
        profileImageUrl: row.userProfileImageUrl,
        isProfilePublic: row.userIsProfilePublic,
        createdAt: row.userCreatedAt!,
        updatedAt: row.userUpdatedAt!,
      }
    }));

    return entriesWithUser;
  }

  async getFeedJournalEntries(userId: string, limit = 20): Promise<JournalEntryWithUser[]> {
    console.log('🗂️ [DB] Fetching feed entries for userId:', userId);
    
    const result = await this.db
      .select({
        // Journal entry fields
        id: journalEntries.id,
        userId: journalEntries.userId,
        title: journalEntries.title,
        content: journalEntries.content,
        audioUrl: journalEntries.audioUrl,
        audioPlayable: journalEntries.audioPlayable,
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
        userUsername: users.username,
        userBio: users.bio,
        userProfileImageUrl: users.profileImageUrl,
        userIsProfilePublic: users.isProfilePublic,
        userCreatedAt: users.createdAt,
        userUpdatedAt: users.updatedAt,
      })
      .from(journalEntries)
      .leftJoin(users, eq(journalEntries.userId, users.id))
      .where(
        and(
          ne(journalEntries.userId, userId), // Exclude current user's own entries
          or(
            eq(journalEntries.privacy, 'public'),
            sql`${userId} = ANY(${journalEntries.sharedWith})`
          )
        )
      )
      .orderBy(desc(journalEntries.createdAt))
      .limit(limit);

    console.log('🗂️ [DB] Found', result.length, 'feed entries');
    
    const entriesWithUser: JournalEntryWithUser[] = result.map((row) => ({
      id: row.id,
      userId: row.userId,
      title: row.title,
      content: row.content,
      audioUrl: row.audioUrl,
      audioPlayable: row.audioPlayable,
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
        username: row.userUsername,
        bio: row.userBio,
        profileImageUrl: row.userProfileImageUrl,
        isProfilePublic: row.userIsProfilePublic,
        createdAt: row.userCreatedAt!,
        updatedAt: row.userUpdatedAt!,
      }
    }));

    return entriesWithUser;
  }

  async getSharedJournalEntries(userId: string, limit = 20): Promise<JournalEntryWithUser[]> {
    console.log('🗂️ [DB] Fetching shared entries for userId:', userId);
    
    const result = await this.db
      .select({
        // Journal entry fields
        id: journalEntries.id,
        userId: journalEntries.userId,
        title: journalEntries.title,
        content: journalEntries.content,
        audioUrl: journalEntries.audioUrl,
        audioPlayable: journalEntries.audioPlayable,
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
        userUsername: users.username,
        userBio: users.bio,
        userProfileImageUrl: users.profileImageUrl,
        userIsProfilePublic: users.isProfilePublic,
        userCreatedAt: users.createdAt,
        userUpdatedAt: users.updatedAt,
      })
      .from(journalEntries)
      .leftJoin(users, eq(journalEntries.userId, users.id))
      .where(
        and(
          ne(journalEntries.userId, userId), // Exclude current user's own entries
          sql`${userId} = ANY(${journalEntries.sharedWith})`
        )
      )
      .orderBy(desc(journalEntries.createdAt))
      .limit(limit);

    console.log('🗂️ [DB] Found', result.length, 'shared entries');
    
    const entriesWithUser: JournalEntryWithUser[] = result.map((row) => ({
      id: row.id,
      userId: row.userId,
      title: row.title,
      content: row.content,
      audioUrl: row.audioUrl,
      audioPlayable: row.audioPlayable,
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
        username: row.userUsername,
        bio: row.userBio,
        profileImageUrl: row.userProfileImageUrl,
        isProfilePublic: row.userIsProfilePublic,
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

  async getComment(id: string): Promise<Comment | undefined> {
    const result = await this.db.select().from(comments).where(eq(comments.id, id));
    return result[0];
  }

  async getCommentsByEntryId(entryId: string): Promise<CommentWithUser[]> {
    const result = await this.db
      .select({
        // Comment fields
        id: comments.id,
        entryId: comments.entryId,
        userId: comments.userId,
        content: comments.content,
        mediaUrls: comments.mediaUrls,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        // User fields
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userUsername: users.username,
        userBio: users.bio,
        userProfileImageUrl: users.profileImageUrl,
        userIsProfilePublic: users.isProfilePublic,
        userCreatedAt: users.createdAt,
        userUpdatedAt: users.updatedAt,
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.entryId, entryId))
      .orderBy(desc(comments.createdAt));

    const commentsWithUser: CommentWithUser[] = result.map((row) => ({
      id: row.id,
      entryId: row.entryId,
      userId: row.userId,
      content: row.content,
      mediaUrls: row.mediaUrls || [],
      createdAt: row.createdAt!,
      updatedAt: row.updatedAt!,
      user: {
        id: row.userId,
        email: row.userEmail,
        firstName: row.userFirstName,
        lastName: row.userLastName,
        username: row.userUsername,
        bio: row.userBio,
        profileImageUrl: row.userProfileImageUrl,
        isProfilePublic: row.userIsProfilePublic,
        createdAt: row.userCreatedAt,
        updatedAt: row.userUpdatedAt,
      }
    }));

    return commentsWithUser;
  }

  async getCommentsByEntryIdPublic(entryId: string): Promise<CommentWithPublicUser[]> {
    const result = await this.db
      .select({
        // Comment fields
        id: comments.id,
        entryId: comments.entryId,
        userId: comments.userId,
        content: comments.content,
        mediaUrls: comments.mediaUrls,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        // Public user fields only
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userUsername: users.username,
        userBio: users.bio,
        userProfileImageUrl: users.profileImageUrl,
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.entryId, entryId))
      .orderBy(desc(comments.createdAt));

    const commentsWithPublicUser: CommentWithPublicUser[] = result
      .filter(row => row.userUsername !== null) // Only include users with usernames
      .map((row) => ({
        id: row.id,
        entryId: row.entryId,
        userId: row.userId,
        content: row.content,
        mediaUrls: row.mediaUrls || [],
        createdAt: row.createdAt!,
        updatedAt: row.updatedAt!,
        user: {
          id: row.userId,
          username: row.userUsername!,
          firstName: row.userFirstName,
          lastName: row.userLastName,
          bio: row.userBio,
          profileImageUrl: row.userProfileImageUrl,
        }
      }));

    return commentsWithPublicUser;
  }

  async createComment(commentData: InsertComment, userId: string): Promise<Comment> {
    const result = await this.db.insert(comments).values({
      id: randomUUID(),
      entryId: commentData.entryId,
      userId,
      content: commentData.content,
      mediaUrls: commentData.mediaUrls || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    
    return result[0];
  }

  async updateComment(id: string, updates: Partial<InsertComment>): Promise<Comment> {
    const result = await this.db
      .update(comments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(comments.id, id))
      .returning();
    
    if (!result[0]) {
      throw new Error('Comment not found');
    }
    return result[0];
  }

  async deleteComment(id: string): Promise<void> {
    await this.db.delete(comments).where(eq(comments.id, id));
  }

  // Connection management methods
  async sendConnectionRequest(requesterId: string, recipientId: string): Promise<UserConnection> {
    // Prevent self-connections
    if (requesterId === recipientId) {
      throw new Error('Cannot send connection request to yourself');
    }
    
    // Check if connection already exists
    const existing = await this.db
      .select()
      .from(userConnections)
      .where(
        or(
          and(eq(userConnections.requesterId, requesterId), eq(userConnections.recipientId, recipientId)),
          and(eq(userConnections.requesterId, recipientId), eq(userConnections.recipientId, requesterId))
        )
      );
    
    if (existing.length > 0) {
      const connection = existing[0];
      
      // Provide specific error messages based on existing connection status
      switch (connection.status) {
        case "pending":
          if (connection.requesterId === requesterId) {
            throw new Error('You have already sent a connection request to this user');
          } else {
            throw new Error('This user has already sent you a connection request. Check your pending requests');
          }
        case "accepted":
          throw new Error('You are already connected to this user');
        case "blocked":
          if (connection.requesterId === requesterId) {
            throw new Error('You have blocked this user. Please unblock them first to send a connection request');
          } else {
            throw new Error('Cannot send connection request. User relationship is blocked');
          }
        default:
          throw new Error('Connection request cannot be processed');
      }
    }
    
    const result = await this.db.insert(userConnections).values({
      id: randomUUID(),
      requesterId,
      recipientId,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    
    return result[0];
  }

  async acceptConnectionRequest(requestId: string, userId: string): Promise<UserConnection> {
    // First, get the connection request to validate it exists and is in correct state
    const existingConnection = await this.db
      .select()
      .from(userConnections)
      .where(eq(userConnections.id, requestId));
    
    if (!existingConnection[0]) {
      throw new Error('Connection request not found');
    }
    
    const connection = existingConnection[0];
    
    // Validate status is pending
    if (connection.status !== "pending") {
      throw new Error('Connection request is no longer pending');
    }
    
    // Validate authorization - only recipient can accept
    if (connection.recipientId !== userId) {
      throw new Error('Unauthorized: Only the recipient can accept this connection request');
    }
    
    // Update the connection to accepted
    const result = await this.db
      .update(userConnections)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(userConnections.id, requestId))
      .returning();
    
    return result[0];
  }

  async rejectConnectionRequest(requestId: string, userId: string): Promise<void> {
    // First, get the connection request to validate it exists and user is authorized
    const existingConnection = await this.db
      .select()
      .from(userConnections)
      .where(eq(userConnections.id, requestId));
    
    if (!existingConnection[0]) {
      throw new Error('Connection request not found');
    }
    
    const connection = existingConnection[0];
    
    // Validate authorization - only recipient can reject
    if (connection.recipientId !== userId) {
      throw new Error('Unauthorized: Only the recipient can reject this connection request');
    }
    
    // Validate status is pending
    if (connection.status !== "pending") {
      throw new Error('Connection request is no longer pending');
    }
    
    await this.db.delete(userConnections).where(eq(userConnections.id, requestId));
  }

  async blockUser(requesterId: string, recipientId: string): Promise<UserConnection> {
    // Check if connection already exists and update or create
    const existing = await this.db
      .select()
      .from(userConnections)
      .where(
        or(
          and(eq(userConnections.requesterId, requesterId), eq(userConnections.recipientId, recipientId)),
          and(eq(userConnections.requesterId, recipientId), eq(userConnections.recipientId, requesterId))
        )
      );
    
    if (existing.length > 0) {
      const result = await this.db
        .update(userConnections)
        .set({ status: "blocked", updatedAt: new Date() })
        .where(eq(userConnections.id, existing[0].id))
        .returning();
      return result[0];
    } else {
      const result = await this.db.insert(userConnections).values({
        id: randomUUID(),
        requesterId,
        recipientId,
        status: "blocked",
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      return result[0];
    }
  }

  async unblockUser(requesterId: string, recipientId: string): Promise<void> {
    // Delete blocked connection in either direction
    await this.db
      .delete(userConnections)
      .where(
        and(
          or(
            and(eq(userConnections.requesterId, requesterId), eq(userConnections.recipientId, recipientId)),
            and(eq(userConnections.requesterId, recipientId), eq(userConnections.recipientId, requesterId))
          ),
          eq(userConnections.status, "blocked")
        )
      );
  }

  async getConnectionRequests(userId: string, type: 'received' | 'sent'): Promise<UserConnectionWithUser[]> {
    const isReceived = type === 'received';
    const currentUserField = isReceived ? userConnections.recipientId : userConnections.requesterId;
    
    // Create aliases for users table to join both requester and recipient
    const requesterUser = alias(users, 'requesterUser');
    const recipientUser = alias(users, 'recipientUser');
    
    const result = await this.db
      .select({
        // Connection fields
        id: userConnections.id,
        requesterId: userConnections.requesterId,
        recipientId: userConnections.recipientId,
        status: userConnections.status,
        createdAt: userConnections.createdAt,
        updatedAt: userConnections.updatedAt,
        // Requester user fields
        requesterEmail: requesterUser.email,
        requesterFirstName: requesterUser.firstName,
        requesterLastName: requesterUser.lastName,
        requesterUsername: requesterUser.username,
        requesterBio: requesterUser.bio,
        requesterProfileImageUrl: requesterUser.profileImageUrl,
        requesterIsProfilePublic: requesterUser.isProfilePublic,
        requesterCreatedAt: requesterUser.createdAt,
        requesterUpdatedAt: requesterUser.updatedAt,
        // Recipient user fields
        recipientEmail: recipientUser.email,
        recipientFirstName: recipientUser.firstName,
        recipientLastName: recipientUser.lastName,
        recipientUsername: recipientUser.username,
        recipientBio: recipientUser.bio,
        recipientProfileImageUrl: recipientUser.profileImageUrl,
        recipientIsProfilePublic: recipientUser.isProfilePublic,
        recipientCreatedAt: recipientUser.createdAt,
        recipientUpdatedAt: recipientUser.updatedAt,
      })
      .from(userConnections)
      .leftJoin(requesterUser, eq(userConnections.requesterId, requesterUser.id))
      .leftJoin(recipientUser, eq(userConnections.recipientId, recipientUser.id))
      .where(
        and(
          eq(currentUserField, userId),
          eq(userConnections.status, "pending")
        )
      )
      .orderBy(desc(userConnections.createdAt));

    // Convert to UserConnectionWithUser format with proper user data for both sides
    return result.map((row) => ({
      id: row.id,
      requesterId: row.requesterId,
      recipientId: row.recipientId,
      status: row.status as "pending" | "accepted" | "blocked",
      createdAt: row.createdAt!,
      updatedAt: row.updatedAt!,
      requester: {
        id: row.requesterId,
        email: row.requesterEmail || '',
        firstName: row.requesterFirstName,
        lastName: row.requesterLastName,
        username: row.requesterUsername,
        bio: row.requesterBio,
        profileImageUrl: row.requesterProfileImageUrl,
        isProfilePublic: row.requesterIsProfilePublic || false,
        createdAt: row.requesterCreatedAt || new Date(),
        updatedAt: row.requesterUpdatedAt || new Date(),
      },
      recipient: {
        id: row.recipientId,
        email: row.recipientEmail || '',
        firstName: row.recipientFirstName,
        lastName: row.recipientLastName,
        username: row.recipientUsername,
        bio: row.recipientBio,
        profileImageUrl: row.recipientProfileImageUrl,
        isProfilePublic: row.recipientIsProfilePublic || false,
        createdAt: row.recipientCreatedAt || new Date(),
        updatedAt: row.recipientUpdatedAt || new Date(),
      },
    }));
  }

  async getConnections(userId: string): Promise<UserConnectionWithUser[]> {
    // Create aliases for users table to join both requester and recipient
    const requesterUser = alias(users, 'requesterUser');
    const recipientUser = alias(users, 'recipientUser');
    
    const result = await this.db
      .select({
        // Connection fields
        id: userConnections.id,
        requesterId: userConnections.requesterId,
        recipientId: userConnections.recipientId,
        status: userConnections.status,
        createdAt: userConnections.createdAt,
        updatedAt: userConnections.updatedAt,
        // Requester user fields
        requesterEmail: requesterUser.email,
        requesterFirstName: requesterUser.firstName,
        requesterLastName: requesterUser.lastName,
        requesterUsername: requesterUser.username,
        requesterBio: requesterUser.bio,
        requesterProfileImageUrl: requesterUser.profileImageUrl,
        requesterIsProfilePublic: requesterUser.isProfilePublic,
        requesterCreatedAt: requesterUser.createdAt,
        requesterUpdatedAt: requesterUser.updatedAt,
        // Recipient user fields
        recipientEmail: recipientUser.email,
        recipientFirstName: recipientUser.firstName,
        recipientLastName: recipientUser.lastName,
        recipientUsername: recipientUser.username,
        recipientBio: recipientUser.bio,
        recipientProfileImageUrl: recipientUser.profileImageUrl,
        recipientIsProfilePublic: recipientUser.isProfilePublic,
        recipientCreatedAt: recipientUser.createdAt,
        recipientUpdatedAt: recipientUser.updatedAt,
      })
      .from(userConnections)
      .leftJoin(requesterUser, eq(userConnections.requesterId, requesterUser.id))
      .leftJoin(recipientUser, eq(userConnections.recipientId, recipientUser.id))
      .where(
        and(
          or(eq(userConnections.requesterId, userId), eq(userConnections.recipientId, userId)),
          eq(userConnections.status, "accepted")
        )
      )
      .orderBy(desc(userConnections.createdAt));

    // Convert to UserConnectionWithUser format with proper user data for both sides
    return result.map((row) => ({
      id: row.id,
      requesterId: row.requesterId,
      recipientId: row.recipientId,
      status: row.status as "pending" | "accepted" | "blocked",
      createdAt: row.createdAt!,
      updatedAt: row.updatedAt!,
      requester: {
        id: row.requesterId,
        email: row.requesterEmail || '',
        firstName: row.requesterFirstName,
        lastName: row.requesterLastName,
        username: row.requesterUsername,
        bio: row.requesterBio,
        profileImageUrl: row.requesterProfileImageUrl,
        isProfilePublic: row.requesterIsProfilePublic || false,
        createdAt: row.requesterCreatedAt || new Date(),
        updatedAt: row.requesterUpdatedAt || new Date(),
      },
      recipient: {
        id: row.recipientId,
        email: row.recipientEmail || '',
        firstName: row.recipientFirstName,
        lastName: row.recipientLastName,
        username: row.recipientUsername,
        bio: row.recipientBio,
        profileImageUrl: row.recipientProfileImageUrl,
        isProfilePublic: row.recipientIsProfilePublic || false,
        createdAt: row.recipientCreatedAt || new Date(),
        updatedAt: row.recipientUpdatedAt || new Date(),
      },
    }));
  }

  async getConnectionStatus(requesterId: string, recipientId: string): Promise<UserConnection | undefined> {
    const result = await this.db
      .select()
      .from(userConnections)
      .where(
        or(
          and(eq(userConnections.requesterId, requesterId), eq(userConnections.recipientId, recipientId)),
          and(eq(userConnections.requesterId, recipientId), eq(userConnections.recipientId, requesterId))
        )
      );
    
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
        audioPlayable: journalEntries.audioPlayable,
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
        audioPlayable: row.audioPlayable || false,
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
        audioPlayable: journalEntries.audioPlayable,
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
      audioPlayable: row.audioPlayable ?? false,
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
        audioPlayable: journalEntries.audioPlayable,
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
        audioPlayable: row.audioPlayable || false,
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
  private comments: Map<string, Comment>;
  private aiChatSessions: Map<string, AiChatSession>;

  constructor() {
    this.users = new Map();
    this.journalEntries = new Map();
    this.comments = new Map();
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
      id,
      email: insertUser.email ?? null,
      firstName: insertUser.firstName ?? null,
      lastName: insertUser.lastName ?? null,
      username: insertUser.username ?? null,
      bio: insertUser.bio ?? null,
      profileImageUrl: insertUser.profileImageUrl ?? null,
      isProfilePublic: insertUser.isProfilePublic ?? null,
      createdAt: insertUser.createdAt ?? now,
      updatedAt: insertUser.updatedAt ?? now
    };
    this.users.set(id, user);
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existingUser = userData.id ? this.users.get(userData.id) : null;
    
    if (existingUser) {
      // Update existing user
      const updatedUser: User = {
        ...existingUser,
        ...userData,
        updatedAt: new Date(),
      };
      this.users.set(existingUser.id, updatedUser);
      return updatedUser;
    } else {
      // Create new user
      return this.createUser(userData);
    }
  }

  async updateUserProfile(id: string, updates: UpdateUserProfile): Promise<User> {
    const existingUser = this.users.get(id);
    if (!existingUser) {
      throw new Error('User not found');
    }
    
    const updatedUser: User = {
      ...existingUser,
      ...updates,
      updatedAt: new Date()
    };
    
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async searchUsers(query: string, limit = 10): Promise<User[]> {
    const allUsers = Array.from(this.users.values());
    return allUsers
      .filter(user => 
        user.email?.toLowerCase().includes(query.toLowerCase()) ||
        user.firstName?.toLowerCase().includes(query.toLowerCase()) ||
        user.lastName?.toLowerCase().includes(query.toLowerCase()) ||
        user.username?.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, limit);
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
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
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

  async getFeedJournalEntries(userId: string, limit = 20): Promise<JournalEntryWithUser[]> {
    const allEntries = Array.from(this.journalEntries.values());
    console.log('🗂️ Fetching feed entries for userId:', userId);
    
    const entries = allEntries
      .filter(entry => 
        entry.privacy === 'public' || 
        (entry.sharedWith && entry.sharedWith.includes(userId))
      )
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);

    console.log('🗂️ Filtered feed entries:', entries.length);

    const entriesWithUser: JournalEntryWithUser[] = [];
    for (const entry of entries) {
      const user = await this.getUser(entry.userId);
      if (user) {
        entriesWithUser.push({ ...entry, user });
      }
    }
    
    console.log('🗂️ Final feed entries with user:', entriesWithUser.length);
    return entriesWithUser;
  }

  async getSharedJournalEntries(userId: string, limit = 20): Promise<JournalEntryWithUser[]> {
    const allEntries = Array.from(this.journalEntries.values());
    console.log('🗂️ Fetching shared entries for userId:', userId);
    
    const entries = allEntries
      .filter(entry => 
        entry.sharedWith && entry.sharedWith.includes(userId)
      )
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);

    console.log('🗂️ Filtered shared entries:', entries.length);

    const entriesWithUser: JournalEntryWithUser[] = [];
    for (const entry of entries) {
      const user = await this.getUser(entry.userId);
      if (user) {
        entriesWithUser.push({ ...entry, user });
      }
    }
    
    console.log('🗂️ Final shared entries with user:', entriesWithUser.length);
    return entriesWithUser;
  }

  async createJournalEntry(entryData: InsertJournalEntry, userId: string): Promise<JournalEntry> {
    const id = randomUUID();
    const now = new Date();
    const entry: JournalEntry = {
      id,
      userId,
      title: entryData.title ?? null,
      content: entryData.content,
      audioUrl: entryData.audioUrl ?? null,
      audioPlayable: entryData.audioPlayable ?? false,
      mediaUrls: entryData.mediaUrls ?? [],
      tags: entryData.tags ?? [],
      privacy: entryData.privacy ?? "private",
      sharedWith: entryData.sharedWith ?? [],
      aiInsights: null,
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
      .sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));
  }

  async createAiChatSession(sessionData: InsertAiChatSession, userId: string): Promise<AiChatSession> {
    const id = randomUUID();
    const now = new Date();
    const session: AiChatSession = {
      id,
      userId,
      title: sessionData.title ?? null,
      messages: sessionData.messages ?? [],
      relatedEntryIds: sessionData.relatedEntryIds ?? [],
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

  async getComment(id: string): Promise<Comment | undefined> {
    return this.comments.get(id);
  }

  async getCommentsByEntryId(entryId: string): Promise<CommentWithUser[]> {
    const allComments = Array.from(this.comments.values());
    const entryComments = allComments
      .filter(comment => comment.entryId === entryId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

    const commentsWithUser: CommentWithUser[] = [];
    for (const comment of entryComments) {
      const user = await this.getUser(comment.userId);
      if (user) {
        commentsWithUser.push({ ...comment, user });
      }
    }
    
    return commentsWithUser;
  }

  async getCommentsByEntryIdPublic(entryId: string): Promise<CommentWithPublicUser[]> {
    const allComments = Array.from(this.comments.values());
    const entryComments = allComments
      .filter(comment => comment.entryId === entryId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

    const commentsWithPublicUser: CommentWithPublicUser[] = [];
    for (const comment of entryComments) {
      const user = await this.getUser(comment.userId);
      if (user && user.username) {
        // Only include users with usernames for public comments
        const publicUser: PublicUser = {
          id: user.id,
          username: user.username!,
          firstName: user.firstName,
          lastName: user.lastName,
          bio: user.bio,
          profileImageUrl: user.profileImageUrl,
        };
        commentsWithPublicUser.push({ ...comment, user: publicUser });
      }
    }
    
    return commentsWithPublicUser;
  }

  async createComment(commentData: InsertComment, userId: string): Promise<Comment> {
    const id = randomUUID();
    const now = new Date();
    const comment: Comment = {
      ...commentData,
      id,
      userId,
      mediaUrls: commentData.mediaUrls || [],
      createdAt: now,
      updatedAt: now
    };
    
    this.comments.set(id, comment);
    return comment;
  }

  async updateComment(id: string, updates: Partial<InsertComment>): Promise<Comment> {
    const existing = this.comments.get(id);
    if (!existing) {
      throw new Error('Comment not found');
    }
    
    const updated: Comment = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };
    
    this.comments.set(id, updated);
    return updated;
  }

  async deleteComment(id: string): Promise<void> {
    this.comments.delete(id);
  }

  // Connection management methods (stub implementations for MemStorage)
  async sendConnectionRequest(requesterId: string, recipientId: string): Promise<UserConnection> {
    throw new Error('Connection methods not implemented in MemStorage - use DbStorage');
  }

  async acceptConnectionRequest(requestId: string, userId: string): Promise<UserConnection> {
    throw new Error('Connection methods not implemented in MemStorage - use DbStorage');
  }

  async rejectConnectionRequest(requestId: string, userId: string): Promise<void> {
    throw new Error('Connection methods not implemented in MemStorage - use DbStorage');
  }

  async blockUser(requesterId: string, recipientId: string): Promise<UserConnection> {
    throw new Error('Connection methods not implemented in MemStorage - use DbStorage');
  }

  async unblockUser(requesterId: string, recipientId: string): Promise<void> {
    throw new Error('Connection methods not implemented in MemStorage - use DbStorage');
  }

  async getConnectionRequests(userId: string, type: 'received' | 'sent'): Promise<UserConnectionWithUser[]> {
    throw new Error('Connection methods not implemented in MemStorage - use DbStorage');
  }

  async getConnections(userId: string): Promise<UserConnectionWithUser[]> {
    throw new Error('Connection methods not implemented in MemStorage - use DbStorage');
  }

  async getConnectionStatus(requesterId: string, recipientId: string): Promise<UserConnection | undefined> {
    throw new Error('Connection methods not implemented in MemStorage - use DbStorage');
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
