import { 
  type User, 
  type UpsertUser,
  type JournalEntry,
  type InsertJournalEntry,
  type JournalEntryWithUser,
  type AiChatSession,
  type InsertAiChatSession,
  type AiChatMessage
} from "@shared/schema";
import { randomUUID } from "crypto";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  
  // Journal entry methods
  getJournalEntry(id: string): Promise<JournalEntry | undefined>;
  getJournalEntriesByUserId(userId: string, limit?: number): Promise<JournalEntryWithUser[]>;
  createJournalEntry(entry: InsertJournalEntry, userId: string): Promise<JournalEntry>;
  updateJournalEntry(id: string, entry: Partial<InsertJournalEntry>): Promise<JournalEntry>;
  deleteJournalEntry(id: string): Promise<void>;
  
  // AI Chat methods
  getAiChatSession(id: string): Promise<AiChatSession | undefined>;
  getAiChatSessionsByUserId(userId: string): Promise<AiChatSession[]>;
  createAiChatSession(session: InsertAiChatSession, userId: string): Promise<AiChatSession>;
  updateAiChatSession(id: string, updates: Partial<{ messages: AiChatMessage[]; updatedAt: Date }>): Promise<AiChatSession>;
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
      profileImageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
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
    const entries = Array.from(this.journalEntries.values())
      .filter(entry => entry.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);

    const entriesWithUser: JournalEntryWithUser[] = [];
    for (const entry of entries) {
      const user = await this.getUser(entry.userId);
      if (user) {
        entriesWithUser.push({ ...entry, user });
      }
    }
    
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
}

export const storage = new MemStorage();
