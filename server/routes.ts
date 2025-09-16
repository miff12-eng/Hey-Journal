import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateAIResponse, transcribeAudio, analyzeJournalEntry } from "./ai";
import { insertJournalEntrySchema, insertAiChatSessionSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage";
import { ObjectPermission } from "./objectAcl";

// Extend Express Request interface to include userId
declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Development authentication bypass (exclude public routes)
  app.use('/api', async (req, res, next) => {
    // Skip authentication for public routes
    if (req.originalUrl.startsWith('/api/public/')) {
      return next();
    }
    
    // Development bypass - always authenticate as mock user
    req.userId = 'mock-user-id';
    
    // Ensure mock user exists in storage
    let user = await storage.getUser(req.userId);
    if (!user) {
      console.log('🔧 Creating mock user in storage');
      user = await storage.createUser({
        id: req.userId,
        email: 'user@example.com',
        firstName: 'Demo',
        lastName: 'User'
      });
      console.log('✅ Mock user created:', user.id);
    }
    
    next();
  });

  // Development login endpoint bypass
  app.post('/api/auth/login', async (req, res) => {
    const mockUser = await storage.getUser('mock-user-id');
    res.json({ user: mockUser, success: true });
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Auth endpoint - return mock user for development
  app.get('/api/auth/user', async (req, res) => {
    // In development, return a mock authenticated user
    const mockUser = await storage.getUser('mock-user-id');
    res.json(mockUser);
  });

  // AI Chat endpoints
  app.post('/api/ai/chat', async (req, res) => {
    console.log('🤖 AI Chat Request:', { message: req.body.message?.substring(0, 50), conversationId: req.body.conversationId });
    try {
      const { message, conversationId } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Get user's recent journal entries for context
      const entries = await storage.getJournalEntriesByUserId(req.userId, 10);
      
      // Get previous conversation if exists
      let previousMessages: any[] = [];
      if (conversationId) {
        const session = await storage.getAiChatSession(conversationId);
        if (session) {
          previousMessages = session.messages || [];
        }
      }

      console.log('🔍 Calling OpenAI with:', { entriesCount: entries.length, previousCount: previousMessages.length });
      const aiResponse = await generateAIResponse(message, entries, previousMessages);
      console.log('✅ OpenAI Response:', aiResponse ? aiResponse.substring(0, 100) + '...' : 'EMPTY RESPONSE');
      
      // Save the conversation
      const newMessage = {
        id: Date.now().toString(),
        role: 'user' as const,
        content: message,
        timestamp: new Date().toISOString()
      };
      
      const aiMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: aiResponse,
        timestamp: new Date().toISOString(),
        relatedEntryIds: entries.slice(0, 3).map(e => e.id) // Reference recent entries
      };

      let sessionId = conversationId;
      if (!sessionId) {
        // Create new session
        const session = await storage.createAiChatSession({
          title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
          messages: [newMessage, aiMessage],
          relatedEntryIds: aiMessage.relatedEntryIds
        }, req.userId);
        sessionId = session.id;
      } else {
        // Update existing session
        await storage.updateAiChatSession(sessionId, {
          messages: [...previousMessages, newMessage, aiMessage],
          updatedAt: new Date()
        });
      }

      res.json({
        message: aiMessage,
        conversationId: sessionId
      });
    } catch (error) {
      console.error('AI Chat Error:', error);
      
      // Handle specific OpenAI errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('insufficient_quota')) {
        res.status(429).json({ 
          error: 'OpenAI API quota exceeded. Please check your OpenAI billing and usage limits.',
          type: 'quota_exceeded'
        });
      } else if (errorMessage.includes('rate_limit')) {
        res.status(429).json({ 
          error: 'Rate limit reached. Please try again in a moment.',
          type: 'rate_limit'
        });
      } else {
        res.status(500).json({ error: 'Failed to generate AI response' });
      }
    }
  });

  // Voice transcription endpoint
  app.post('/api/ai/transcribe', upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Audio file is required' });
      }

      const { text, confidence } = await transcribeAudio(req.file.buffer);
      
      res.json({ 
        text, 
        confidence,
        duration: req.file.size / 16000 // Rough estimate
      });
    } catch (error) {
      console.error('Transcription Error:', error);
      res.status(500).json({ error: 'Failed to transcribe audio' });
    }
  });

  // Journal entries endpoints
  app.post('/api/journal/entries', async (req, res) => {
    try {
      const entryData = insertJournalEntrySchema.parse(req.body);
      
      // Analyze entry with AI if content exists
      let analysis = null;
      if (entryData.content) {
        analysis = await analyzeJournalEntry(entryData.content);
        
        // Add AI-suggested tags to existing tags
        const existingTags = entryData.tags || [];
        const suggestedTags = analysis.suggestedTags.filter(
          tag => !existingTags.includes(tag)
        ).slice(0, 3); // Limit to 3 suggestions
        
        entryData.tags = [...existingTags, ...suggestedTags];
      }

      const entry = await storage.createJournalEntry(entryData, req.userId);
      
      res.json({
        entry,
        analysis
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid entry data', details: error.errors });
      }
      console.error('Create Entry Error:', error);
      res.status(500).json({ error: 'Failed to create journal entry' });
    }
  });

  app.get('/api/journal/entries', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      console.log('📚 Fetching entries for userId:', req.userId);
      const entries = await storage.getJournalEntriesByUserId(req.userId, limit);
      console.log('📚 Found', entries.length, 'entries');
      res.json(entries);
    } catch (error) {
      console.error('Get Entries Error:', error);
      res.status(500).json({ error: 'Failed to fetch journal entries' });
    }
  });

  // ========== PUBLIC API ROUTES (No Authentication Required) ==========
  
  // Public user search endpoint
  app.get('/api/public/users/search', async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
      }
      
      const limit = parseInt(req.query.limit as string) || 20;
      const users = await storage.searchPublicUsers(query, limit);
      
      res.json(users);
    } catch (error) {
      console.error('Public Users Search Error:', error);
      res.status(500).json({ error: 'Failed to search public users' });
    }
  });

  // Public user profile endpoint
  app.get('/api/public/users/:username', async (req, res) => {
    try {
      const { username } = req.params;
      const user = await storage.getPublicUserByUsername(username);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json(user);
    } catch (error) {
      console.error('Public User Profile Error:', error);
      res.status(500).json({ error: 'Failed to fetch user profile' });
    }
  });

  // Public user's entries endpoint
  app.get('/api/public/users/:username/entries', async (req, res) => {
    try {
      const { username } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;
      const cursor = req.query.cursor as string;
      
      // Validate cursor if provided
      if (cursor && isNaN(Date.parse(cursor))) {
        return res.status(400).json({ error: 'Invalid cursor format' });
      }
      
      // First get the user to validate they exist and are public
      const user = await storage.getPublicUserByUsername(username);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const entries = await storage.getPublicEntriesByUserId(user.id, limit, cursor);
      
      res.json({
        entries,
        nextCursor: entries.length === limit ? entries[entries.length - 1]?.createdAt.toISOString() : null
      });
    } catch (error) {
      console.error('Public User Entries Error:', error);
      res.status(500).json({ error: 'Failed to fetch user entries' });
    }
  });

  // Public entries search endpoint (must come before :entryId route)
  app.get('/api/public/entries/search', async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
      }
      
      const limit = parseInt(req.query.limit as string) || 20;
      const cursor = req.query.cursor as string;
      
      // Validate cursor if provided
      if (cursor && isNaN(Date.parse(cursor))) {
        return res.status(400).json({ error: 'Invalid cursor format' });
      }
      
      const entries = await storage.searchPublicEntries(query, limit, cursor);
      
      res.json({
        entries,
        nextCursor: entries.length === limit ? entries[entries.length - 1]?.createdAt.toISOString() : null
      });
    } catch (error) {
      console.error('Public Entries Search Error:', error);
      res.status(500).json({ error: 'Failed to search entries' });
    }
  });

  // Public entry detail endpoint (regex constraint to prevent capturing "search")
  app.get('/api/public/entries/:entryId([0-9a-fA-F-]{10,})', async (req, res) => {
    try {
      const { entryId } = req.params;
      const entry = await storage.getPublicEntryById(entryId);
      
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      res.json(entry);
    } catch (error) {
      console.error('Public Entry Detail Error:', error);
      res.status(500).json({ error: 'Failed to fetch entry' });
    }
  });

  // Object Storage endpoints for photo uploads
  
  // Serve uploaded photos from object storage
  app.get("/objects/:objectPath(*)", async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(
        req.path,
      );
      
      // Check if user can access this object
      // For public objects, allow access without authentication
      // For private objects, require authentication and proper permissions
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: req.userId || null, // Allow undefined userId for public objects
        requestedPermission: ObjectPermission.READ,
      });
      
      if (!canAccess) {
        return res.sendStatus(403); // Use 403 instead of 401 for better semantics
      }
      
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Get upload URL for a new photo
  app.post("/api/photos/upload", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL, objectPath });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Set ACL policy after photo upload
  app.put("/api/photos", async (req, res) => {
    if (!req.body.photoURL) {
      return res.status(400).json({ error: "photoURL is required" });
    }

    try {
      const objectStorageService = new ObjectStorageService();
      
      // First normalize the path to get the canonical object path
      const objectPath = objectStorageService.normalizeObjectEntityPath(req.body.photoURL);
      
      // Security validation: Ensure the path is a valid object path
      if (!objectPath.startsWith("/objects/")) {
        return res.status(400).json({ error: "Invalid object path" });
      }

      // Security validation: Ensure the object path is under uploads/ directory
      // (this ensures it's in the expected user upload directory structure)
      const objectId = objectPath.replace("/objects/", "");
      if (!objectId.startsWith("uploads/")) {
        return res.status(403).json({ error: "Access denied: Object not in user upload directory" });
      }

      // Get the object file to validate it exists and check current ownership
      let objectFile;
      try {
        objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          return res.status(404).json({ error: "Object not found" });
        }
        throw error;
      }

      // Security validation: Check if user has permission to modify this object
      // Since this is right after upload, we check if the user can access it with WRITE permission
      const canModify = await objectStorageService.canAccessObjectEntity({
        userId: req.userId,
        objectFile,
        requestedPermission: ObjectPermission.WRITE,
      });

      // If user can't already access it with WRITE permission, they can set initial ACL
      // This handles the case where the object was just uploaded and has no ACL yet
      if (!canModify) {
        // For newly uploaded objects, we allow setting the initial ACL policy
        // but only if the object was uploaded recently (within last 15 minutes)
        const [metadata] = await objectFile.getMetadata();
        const uploadTime = new Date(metadata.timeCreated);
        const now = new Date();
        const timeDiff = now.getTime() - uploadTime.getTime();
        const fifteenMinutes = 15 * 60 * 1000;

        if (timeDiff > fifteenMinutes) {
          return res.status(403).json({ error: "Access denied: Cannot modify object ACL" });
        }
      }

      // Set the ACL policy
      const finalObjectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.photoURL,
        {
          owner: req.userId,
          // Photos are public so they can be displayed in browser without authentication
          visibility: "public",
        },
      );

      res.status(200).json({
        objectPath: finalObjectPath,
      });
    } catch (error) {
      console.error("Error setting photo ACL:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
