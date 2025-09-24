import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateAIResponse, transcribeAudio } from "./ai";
import { analyzeEntry, semanticRank } from "./services/openai";
import { enhancedAnalyzeEntry } from "./services/enhancedOpenAI";
import EmbeddingProcessor from "./services/embeddingProcessor";
import { insertJournalEntrySchema, insertAiChatSessionSchema, insertCommentSchema, insertLikeSchema, updateUserProfileSchema, insertPersonSchema, insertEntryPersonTagSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage";
import { ObjectPermission, ObjectAclPolicy, setObjectAclPolicy } from "./objectAcl";
import { setupAuth, isAuthenticated } from "./replitAuth";

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

// Global mutex and rate limiting for reprocessing
let reprocessingInProgress = false;
const reprocessingCooldown = new Map<string, number>();

// Utility function to sync audio object ACL with audioPlayable setting
async function syncAudioACL(userId: string, audioUrl: string | null, audioPlayable: boolean): Promise<void> {
  if (!audioUrl) return;
  
  try {
    console.log(`🔒 Syncing ACL for audio: ${audioUrl}, playable: ${audioPlayable}`);
    
    const objectStorageService = new ObjectStorageService();
    const normalizedPath = objectStorageService.normalizeObjectEntityPath(audioUrl);
    
    // Create ACL policy based on audioPlayable setting
    const aclPolicy: ObjectAclPolicy = {
      owner: userId,
      visibility: audioPlayable ? "public" : "private"
    };
    
    await objectStorageService.trySetObjectEntityAclPolicy(normalizedPath, aclPolicy);
    
    console.log(`✅ Audio ACL updated: ${audioUrl} is now ${audioPlayable ? 'public' : 'private'}`);
  } catch (error) {
    console.error(`❌ Failed to sync audio ACL for ${audioUrl}:`, error);
    // Don't throw error - continue with entry save even if ACL fails
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup OAuth authentication
  await setupAuth(app);
  
  // Authentication middleware for protected routes
  app.use('/api', async (req, res, next) => {
    // Debug ALL requests to understand mobile authentication issues
    console.log('🔧 API Request Debug:', {
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent']?.slice(0, 100),
      origin: req.headers.origin,
      referer: req.headers.referer,
      hasSession: !!req.session,
      sessionId: (req.session as any)?.id?.slice(-8)
    });
    // Skip authentication for OAuth endpoints and health check
    if (req.originalUrl.startsWith('/api/login') ||
        req.originalUrl.startsWith('/api/callback') ||
        req.originalUrl.startsWith('/api/logout') ||
        req.originalUrl.startsWith('/api/health') ||
        req.originalUrl.startsWith('/api/debug') ||
        (req.originalUrl.startsWith('/api/journal/reprocess-all-users') && process.env.NODE_ENV !== 'production') ||
        (req.originalUrl.startsWith('/api/journal/bulk-create') && process.env.NODE_ENV !== 'production')) {
      return next();
    }
    
    // For public routes, try to extract user info but don't require authentication
    if (req.originalUrl.startsWith('/api/public/')) {
      const user = req.user as any;
      if (user && user.claims && user.claims.sub) {
        req.userId = user.claims.sub;
      }
      return next();
    }
    
    // Dev/test authentication bypass (ONLY in non-production environments)
    if (process.env.NODE_ENV !== 'production') {
      const testAuth = req.headers['x-test-auth'] as string;
      const testUserId = req.headers['x-test-user-id'] as string;
      
      if (testAuth === process.env.TEST_AUTH_TOKEN && testUserId) {
        console.log('🧪 Dev authentication bypass used for userId:', testUserId);
        req.userId = testUserId;
        return next();
      }
      
      // Also support Bearer token format for testing: Bearer dev:<userId>:<secret>
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer dev:')) {
        const parts = authHeader.replace('Bearer dev:', '').split(':');
        const [userId, secret] = parts;
        if (secret === 'test_token_12345' && userId) {
          console.log('🧪 Dev bearer authentication used for userId:', userId);
          req.userId = userId;
          return next();
        }
      }
      
      // Mobile authentication bypass for Capacitor apps during development
      const userAgent = req.headers['user-agent'] as string;
      if (userAgent?.includes('Mobile') || userAgent?.includes('iPhone') || userAgent?.includes('iPad')) {
        // Use existing user ID from successful web sessions for mobile testing
        const existingUserId = '38345650'; // Your existing user ID from logs
        console.log('📱 Mobile development bypass used for userId:', existingUserId);
        req.userId = existingUserId;
        return next();
      }
    }
    
    // Apply the isAuthenticated middleware which handles token refresh
    isAuthenticated(req, res, (err) => {
      if (err) {
        console.log('❌ Authentication failed:', {
          method: req.method,
          path: req.path,
          hasSession: !!req.session,
          isAuthenticated: req.isAuthenticated?.(),
          userClaimsSub: (req.user as any)?.claims?.sub
        });
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      // Set userId from OAuth claims (after token refresh if needed)
      const user = req.user as any;
      if (!user?.claims?.sub) {
        console.log('❌ No user claims found:', {
          method: req.method,
          path: req.path,
          hasUser: !!user,
          userKeys: user ? Object.keys(user) : []
        });
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      req.userId = user.claims.sub;
      next();
    });
  });

  // OAuth login is handled by setupAuth - this endpoint redirects to login
  app.get('/api/auth/login', (req, res) => {
    res.redirect('/api/login');
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Process all historical entries for embeddings
  app.post('/api/process-historical-entries', async (req, res) => {
    try {
      const userId = req.userId!;
      
      console.log('🔄 Starting processing of all historical entries for user:', userId);
      
      // Get all entries for this user using storage interface
      const allEntries = await storage.getJournalEntriesByUserId(userId, 1000);
      
      console.log('📊 Found', allEntries.length, 'total entries for user');

      let processedEntries = 0;
      let skippedEntries = 0;
      let errorEntries = 0;

      // Process each entry individually
      for (const entry of allEntries) {
        try {
          // Check if entry already has embeddings
          if (entry.contentEmbedding && entry.lastEmbeddingUpdate) {
            console.log('⏭️ Skipping entry with existing embeddings:', entry.id);
            skippedEntries++;
            continue;
          }

          console.log('🔄 Processing entry:', entry.id, '-', entry.title);
          
          // Use enhanced analysis to generate embeddings
          const { enhancedAnalyzeEntry } = await import('./services/enhancedOpenAI');
          const enhancedInsights = await enhancedAnalyzeEntry(
            entry.content ?? '', 
            entry.title ?? undefined, 
            entry.mediaUrls ?? [],
            entry.audioUrl ?? undefined
          );
          
          if (enhancedInsights && 'embeddingString' in enhancedInsights) {
            // Update entry with enhanced data
            const updateData = {
              searchableText: enhancedInsights.searchableText || undefined,
              contentEmbedding: enhancedInsights.embeddingString || undefined,
              embeddingVersion: 'v1' as string,
              lastEmbeddingUpdate: new Date()
            };
            
            await storage.updateJournalEntry(entry.id, updateData);
            processedEntries++;
            console.log('✅ Successfully processed entry:', entry.id);
          } else {
            console.log('⚠️ No embeddings generated for entry:', entry.id);
            skippedEntries++;
          }

        } catch (error) {
          console.error('❌ Failed to process entry:', entry.id, error);
          errorEntries++;
        }

        // Rate limiting to avoid overwhelming the OpenAI API
        await new Promise(resolve => setTimeout(resolve, 250));
      }

      console.log('🏁 Historical entry processing completed:', {
        totalEntries: allEntries.length,
        processedEntries,
        skippedEntries,
        errorEntries
      });

      res.json({ 
        message: 'All historical entries processed successfully', 
        userId,
        totalEntries: allEntries.length,
        processedEntries,
        skippedEntries,
        errorEntries
      });
      
    } catch (error) {
      console.error('❌ Error processing all historical entries:', error);
      res.status(500).json({ error: 'Failed to process historical entries' });
    }
  });

  // Get authenticated user from OAuth
  app.get('/api/auth/user', async (req, res) => {
    // Debug logging for mobile authentication issues
    console.log('🔍 /api/auth/user Debug:', {
      userId: req.userId,
      hasSession: !!req.session,
      isAuthenticated: req.isAuthenticated?.(),
      userAgent: req.headers['user-agent'],
      hasUser: !!(req.user as any),
      userClaimsSub: (req.user as any)?.claims?.sub,
      cookies: Object.keys(req.cookies || {}),
      sessionId: (req.session as any)?.id?.slice(-8) // Last 8 chars for privacy
    });
    
    // Use the same authentication pattern as other working endpoints
    if (!req.userId) {
      console.log('❌ /api/auth/user failed: no req.userId');
      return res.status(401).json({ message: 'Not authenticated' });
    }
    
    // Get user from storage using userId (set by authentication middleware)
    const dbUser = await storage.getUser(req.userId);
    if (!dbUser) {
      console.log('❌ /api/auth/user failed: user not found in DB for userId:', req.userId);
      return res.status(404).json({ message: 'User not found' });
    }
    
    console.log('✅ /api/auth/user success for userId:', req.userId);
    res.json(dbUser);
  });

  // OAuth logout is handled by setupAuth - this endpoint redirects to logout
  app.post('/api/auth/logout', (req, res) => {
    res.redirect('/api/logout');
  });

  // User Profile endpoints
  app.get('/api/users/me', async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ error: 'Failed to fetch user profile' });
    }
  });

  app.put('/api/users/me', async (req, res) => {
    try {
      // Validate request body
      const validatedData = updateUserProfileSchema.parse(req.body);
      
      // Check username uniqueness if username is being updated
      if (validatedData.username) {
        const existingUser = await storage.getUserByUsername(validatedData.username);
        if (existingUser && existingUser.id !== req.userId) {
          return res.status(409).json({ error: 'Username already taken' });
        }
      }
      
      // Update user profile
      const updatedUser = await storage.updateUserProfile(req.userId, validatedData);
      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating user profile:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid data', details: error.errors });
      }
      if (error instanceof Error && error.message === 'User not found') {
        return res.status(404).json({ error: 'User not found' });
      }
      if ((error as any)?.code === '23505') {
        return res.status(409).json({ error: 'Username already taken' });
      }
      res.status(500).json({ error: 'Failed to update user profile' });
    }
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
        if (session && session.messages) {
          previousMessages = Array.isArray(session.messages) ? session.messages : [];
        }
      }

      console.log('🔍 Calling OpenAI with:', { entriesCount: entries.length, previousCount: previousMessages.length });
      const aiResponse = await generateAIResponse(message, entries as any[], previousMessages);
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

  // AI text analysis for people detection
  app.post('/api/ai/analyze-text', async (req, res) => {
    try {
      const { text, analysisType } = req.body;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Text content is required' });
      }
      
      // Use enhanced AI analysis to detect people
      const { enhancedAnalyzeTextContent } = await import('./services/enhancedOpenAI');
      const analysis = await enhancedAnalyzeTextContent(text);
      
      // Return the analysis in the expected format
      if (analysisType === 'people') {
        // Extract mentioned people from the analysis
        const mentionedPeople = analysis.mentionedPeople || []
        res.json({ mentionedPeople })
      } else {
        // Return full analysis
        res.json(analysis)
      }
    } catch (error) {
      console.error('AI Text Analysis Error:', error);
      res.status(500).json({ error: 'Failed to analyze text' });
    }
  });

  // AI suggestions endpoint for generating title and tag suggestions
  app.post('/api/ai/suggestions', async (req, res) => {
    try {
      const { content } = req.body;
      
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Content is required' });
      }
      
      // Generate title and tag suggestions
      const { generateTitleAndTagSuggestions } = await import('./ai');
      const suggestions = await generateTitleAndTagSuggestions(content);
      
      res.json(suggestions);
    } catch (error) {
      console.error('AI Suggestions Error:', error);
      res.status(500).json({ error: 'Failed to generate suggestions' });
    }
  });

  // Journal entries endpoints
  app.post('/api/journal/entries', async (req, res) => {
    try {
      const entryData = insertJournalEntrySchema.parse(req.body);
      
      // Analyze entry with AI if content or media exists
      let aiInsights = null;
      if (entryData.content || (entryData.mediaUrls && entryData.mediaUrls.length > 0)) {
        console.log('🤖 Analyzing journal entry with AI...');
        try {
          // Get user information for enhanced search with author names
          const user = await storage.getUser(req.userId);
          const authorInfo = user ? {
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username
          } : null;
          
          // Use enhanced analysis with vector embeddings
          console.log('🚀 Using enhanced AI analysis with vector embeddings');
          const enhancedInsights = await enhancedAnalyzeEntry(
            entryData.content ?? '', 
            entryData.title ?? undefined, 
            entryData.mediaUrls ?? [],
            entryData.audioUrl ?? undefined,
            entryData.tags ?? undefined,
            authorInfo
          );
          
          aiInsights = enhancedInsights;
          
          // Store AI insights separately after entry creation
          // Note: aiInsights will be saved via updateAiInsights after createJournalEntry
          
          console.log('✨ AI Analysis completed:', { 
            summary: aiInsights.summary?.substring(0, 50) + '...',
            keywordsCount: aiInsights.keywords?.length || 0,
            sentiment: aiInsights.sentiment 
          });
        } catch (error) {
          console.error('❗ AI Analysis failed:', error);
          // Continue without AI insights if analysis fails
        }
      }

      // Create entry with enhanced data if available
      const createData = aiInsights && 'embeddingString' in aiInsights ? {
        ...entryData,
        searchableText: aiInsights.searchableText || undefined,
        contentEmbedding: aiInsights.embeddingString || undefined,
        embeddingVersion: 'v1' as string,
        lastEmbeddingUpdate: new Date()
      } : {
        ...entryData,
        searchableText: undefined,
        contentEmbedding: undefined,
        embeddingVersion: undefined,
        lastEmbeddingUpdate: undefined
      };
      
      const entry = await storage.createJournalEntry(createData, req.userId);
      
      // Update AI insights separately if analysis was successful
      if (aiInsights) {
        await storage.updateAiInsights(entry.id, aiInsights);
        
        // Queue for any additional processing if needed
        const processor = EmbeddingProcessor.getInstance();
        if (!('embeddingString' in aiInsights)) {
          await processor.queueEntryForProcessing(entry.id);
        }
      }
      
      // Sync audio object ACL with audioPlayable setting
      if (entryData.audioUrl) {
        await syncAudioACL(req.userId, entryData.audioUrl, entryData.audioPlayable ?? false);
      }
      
      res.json({
        entry,
        aiInsights
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
      const type = req.query.type as string || 'own';
      
      console.log('📚 Fetching entries for userId:', req.userId, 'type:', type);
      
      let entries;
      switch (type) {
        case 'feed':
          entries = await storage.getFeedJournalEntries(req.userId, limit);
          break;
        case 'shared':
          entries = await storage.getSharedJournalEntries(req.userId, limit);
          break;
        case 'own':
        default:
          entries = await storage.getJournalEntriesByUserId(req.userId, limit);
          break;
      }
      
      console.log('📚 Found', entries.length, 'entries of type:', type);
      res.json(entries);
    } catch (error) {
      console.error('Get Entries Error:', error);
      res.status(500).json({ error: 'Failed to fetch journal entries' });
    }
  });

  // Get a single journal entry by ID
  app.get('/api/journal/entries/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Fetch entry with user data for JournalEntryCard compatibility
      const entryWithUser = await storage.getJournalEntryWithUser(id);
      
      if (!entryWithUser) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      // Verify entry belongs to the user
      if (entryWithUser.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to access this entry' });
      }
      
      res.json(entryWithUser);
    } catch (error) {
      console.error('Get Entry by ID Error:', error);
      res.status(500).json({ error: 'Failed to fetch journal entry' });
    }
  });

  // Get a single journal entry by ID (public access)
  app.get('/api/public/entries/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Fetch entry with user data
      const entryWithUser = await storage.getJournalEntryWithUser(id);
      
      if (!entryWithUser) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      // Check if entry is public or if user has access
      if (entryWithUser.privacy === 'private' && entryWithUser.userId !== req.userId) {
        // For AI linking purposes, allow authenticated users to view their own private entries
        // but deny access to other users' private entries
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      // Return entry data in PublicEntry format
      const publicEntry = {
        id: entryWithUser.id,
        userId: entryWithUser.userId,
        title: entryWithUser.title,
        content: entryWithUser.content,
        audioUrl: entryWithUser.audioUrl,
        audioPlayable: entryWithUser.audioPlayable,
        mediaUrls: entryWithUser.mediaUrls || [],
        tags: entryWithUser.tags || [],
        createdAt: entryWithUser.createdAt,
        updatedAt: entryWithUser.updatedAt,
        user: entryWithUser.user
      };
      
      res.json(publicEntry);
    } catch (error) {
      console.error('Get Public Entry by ID Error:', error);
      res.status(500).json({ error: 'Failed to fetch journal entry' });
    }
  });

  // Update a journal entry
  app.put('/api/journal/entries/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = insertJournalEntrySchema.partial().parse(req.body);
      
      // Verify entry exists and belongs to the user
      const existingEntry = await storage.getJournalEntry(id);
      if (!existingEntry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      if (existingEntry.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to update this entry' });
      }
      
      // Update the entry first - ensure null values become undefined
      const cleanUpdates = {
        ...updates,
        searchableText: updates.searchableText === null ? undefined : updates.searchableText,
        contentEmbedding: updates.contentEmbedding === null ? undefined : updates.contentEmbedding,
        embeddingVersion: updates.embeddingVersion === null ? undefined : updates.embeddingVersion,
        lastEmbeddingUpdate: updates.lastEmbeddingUpdate === null ? undefined : updates.lastEmbeddingUpdate
      };
      const updatedEntry = await storage.updateJournalEntry(id, cleanUpdates);
      
      // Analyze updated content with AI if content or media changed
      if (updates.content !== undefined || updates.mediaUrls !== undefined) {
        console.log('🤖 Re-analyzing updated journal entry with AI...');
        try {
          // Get user information for enhanced search with author names
          const user = await storage.getUser(req.userId);
          const authorInfo = user ? {
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username
          } : null;
          
          const aiInsights = await enhancedAnalyzeEntry(
            updates.content ?? '', 
            updates.title ?? existingEntry.title ?? undefined, 
            updates.mediaUrls ?? (existingEntry.mediaUrls || []),
            updates.audioUrl ?? existingEntry.audioUrl ?? undefined,
            updates.tags ?? existingEntry.tags ?? undefined,
            authorInfo
          );
          
          // Update AI insights separately
          await storage.updateAiInsights(id, aiInsights);
          
          // Update entry with enhanced embedding data if available
          if (aiInsights && 'embeddingString' in aiInsights) {
            await storage.updateJournalEntry(id, {
              searchableText: aiInsights.searchableText || undefined,
              contentEmbedding: aiInsights.embeddingString || undefined,
              embeddingVersion: 'v1' as string,
              lastEmbeddingUpdate: new Date()
            });
          }
          
          console.log('✨ AI Re-analysis completed:', { 
            summary: aiInsights.summary?.substring(0, 50) + '...',
            keywordsCount: aiInsights.keywords?.length || 0,
            sentiment: aiInsights.sentiment 
          });
        } catch (error) {
          console.error('⚠️ AI Re-analysis failed:', error);
          // Continue with update even if AI analysis fails
        }
      }
      
      // Sync audio object ACL if audioUrl or audioPlayable changed
      const audioUrl = updates.audioUrl !== undefined ? updates.audioUrl : existingEntry.audioUrl;
      const audioPlayable = updates.audioPlayable !== undefined ? updates.audioPlayable : existingEntry.audioPlayable;
      
      if (audioUrl && (updates.audioUrl !== undefined || updates.audioPlayable !== undefined)) {
        await syncAudioACL(req.userId, audioUrl, audioPlayable ?? false);
      }
      
      res.json(updatedEntry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid entry data', details: error.errors });
      }
      console.error('Update Entry Error:', error);
      res.status(500).json({ error: 'Failed to update journal entry' });
    }
  });

  // Delete a journal entry
  app.delete('/api/journal/entries/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify entry exists and belongs to the user
      const existingEntry = await storage.getJournalEntry(id);
      if (!existingEntry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      if (existingEntry.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to delete this entry' });
      }
      
      await storage.deleteJournalEntry(id);
      res.status(204).send(); // 204 No Content for successful deletion
    } catch (error) {
      console.error('Delete Entry Error:', error);
      res.status(500).json({ error: 'Failed to delete journal entry' });
    }
  });

  // Comment API routes
  
  // Get comments for a journal entry
  app.get('/api/journal/entries/:entryId/comments', async (req, res) => {
    try {
      const { entryId } = req.params;
      
      // Get the entry to check permissions
      const entry = await storage.getJournalEntry(entryId);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      // Check if user can view comments based on entry privacy
      const canViewComments = 
        entry.userId === req.userId || // Owner can always view
        entry.privacy === 'public' || // Public entries allow anyone to view comments
        (entry.privacy === 'shared' && entry.sharedWith?.includes(req.userId)); // Shared with user
      
      if (!canViewComments) {
        return res.status(403).json({ error: 'Not authorized to view comments on this entry' });
      }
      
      const comments = await storage.getCommentsByEntryIdPublic(entryId);
      res.json(comments);
    } catch (error) {
      console.error('Get Comments Error:', error);
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  });
  
  // Create a comment on a journal entry
  app.post('/api/journal/entries/:entryId/comments', async (req, res) => {
    try {
      const { entryId } = req.params;
      const commentData = insertCommentSchema.parse(req.body);
      
      // Get the entry to check permissions
      const entry = await storage.getJournalEntry(entryId);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      // Check if user can comment based on entry privacy
      const canComment = 
        entry.userId === req.userId || // Owner can always comment
        entry.privacy === 'public' || // Public entries allow anyone to comment
        (entry.privacy === 'shared' && entry.sharedWith?.includes(req.userId)); // Shared with user
      
      if (!canComment) {
        return res.status(403).json({ error: 'Not authorized to comment on this entry' });
      }
      
      // Ensure entryId matches the URL parameter
      const commentToCreate = { ...commentData, entryId };
      
      const comment = await storage.createComment(commentToCreate, req.userId);
      res.status(201).json(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid comment data', details: error.errors });
      }
      console.error('Create Comment Error:', error);
      res.status(500).json({ error: 'Failed to create comment' });
    }
  });
  
  // Update a comment
  app.put('/api/comments/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Only allow updating content and mediaUrls, not entryId or userId
      const updateSchema = z.object({
        content: z.string().optional(),
        mediaUrls: z.array(z.string()).optional()
      });
      
      const updates = updateSchema.parse(req.body);
      
      // Verify comment exists and belongs to the user
      const existingComment = await storage.getComment(id);
      if (!existingComment) {
        return res.status(404).json({ error: 'Comment not found' });
      }
      
      if (existingComment.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to update this comment' });
      }
      
      const updatedComment = await storage.updateComment(id, updates);
      res.json(updatedComment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid comment data', details: error.errors });
      }
      console.error('Update Comment Error:', error);
      res.status(500).json({ error: 'Failed to update comment' });
    }
  });
  
  // Delete a comment
  app.delete('/api/comments/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify comment exists and belongs to the user
      const existingComment = await storage.getComment(id);
      if (!existingComment) {
        return res.status(404).json({ error: 'Comment not found' });
      }
      
      if (existingComment.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to delete this comment' });
      }
      
      await storage.deleteComment(id);
      res.status(204).send(); // 204 No Content for successful deletion
    } catch (error) {
      console.error('Delete Comment Error:', error);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  });

  // Like API routes
  
  // Get like count and user like status for a journal entry
  app.get('/api/journal/entries/:entryId/likes', async (req, res) => {
    try {
      const { entryId } = req.params;
      
      // Get the entry to check permissions
      const entry = await storage.getJournalEntry(entryId);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      // Check if user can view the entry based on privacy
      if (entry.privacy === 'private' && entry.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to view this entry' });
      }
      
      // Get like count and user like status
      const likeCount = await storage.getLikesCountByEntryId(entryId);
      const isLikedByUser = await storage.isEntryLikedByUser(entryId, req.userId);
      
      res.json({ 
        likeCount, 
        isLikedByUser,
        entryId 
      });
    } catch (error) {
      console.error('Get Entry Likes Error:', error);
      res.status(500).json({ error: 'Failed to fetch likes' });
    }
  });
  
  // Toggle like on a journal entry
  app.post('/api/journal/entries/:entryId/likes', async (req, res) => {
    try {
      const { entryId } = req.params;
      
      // Get the entry to check permissions
      const entry = await storage.getJournalEntry(entryId);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      // Check if user can like the entry (no liking private entries unless you own them)
      if (entry.privacy === 'private' && entry.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to like this entry' });
      }
      
      // Toggle like
      const result = await storage.toggleLike(entryId, req.userId);
      
      res.json({
        liked: result.liked,
        likeCount: result.likeCount,
        entryId
      });
    } catch (error) {
      console.error('Toggle Like Error:', error);
      res.status(500).json({ error: 'Failed to toggle like' });
    }
  });

  // Get usage statistics for journal entries
  app.get('/api/journal/stats', async (req, res) => {
    try {
      console.log('📊 Calculating usage stats for user:', req.userId);
      
      // Get all user's entries sorted by creation date
      const allEntries = await storage.getJournalEntriesByUserId(req.userId, 1000);
      
      if (!allEntries || allEntries.length === 0) {
        return res.json({
          entriesThisWeek: 0,
          dayStreak: 0,
          daysSinceLastEntry: null
        });
      }

      // Sort entries by creation date (most recent first)
      const sortedEntries = allEntries.sort((a, b) => 
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );

      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Calculate entries this week
      const entriesThisWeek = sortedEntries.filter(entry => 
        entry.createdAt && new Date(entry.createdAt) >= oneWeekAgo
      ).length;

      // Calculate days since last entry
      const lastEntry = sortedEntries[0];
      const daysSinceLastEntry = Math.floor((now.getTime() - new Date(lastEntry.createdAt || 0).getTime()) / (24 * 60 * 60 * 1000));

      // Calculate day streak (consecutive days with entries starting from today)
      let dayStreak = 0;
      // Use UTC consistently to avoid timezone issues
      const nowUTC = new Date();
      const todayUTC = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate()));

      // Group entries by date (YYYY-MM-DD format using UTC)
      const entriesByDate = new Map<string, number>();
      sortedEntries.forEach(entry => {
        if (entry.createdAt) {
          const dateStr = new Date(entry.createdAt).toISOString().split('T')[0];
          entriesByDate.set(dateStr, (entriesByDate.get(dateStr) || 0) + 1);
        }
      });

      // Check consecutive days starting from today (UTC)
      let currentDate = new Date(todayUTC);
      while (true) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (entriesByDate.has(dateStr)) {
          dayStreak++;
          // Move to previous day
          currentDate.setUTCDate(currentDate.getUTCDate() - 1);
        } else {
          break;
        }
      }

      const stats = {
        entriesThisWeek,
        dayStreak,
        daysSinceLastEntry
      };

      console.log('📊 Usage stats calculated:', stats);
      res.json(stats);
    } catch (error) {
      console.error('Stats calculation error:', error);
      res.status(500).json({ error: 'Failed to calculate usage statistics' });
    }
  });

  // Get user achievements with progress tracking
  app.get('/api/journal/achievements', async (req, res) => {
    try {
      console.log('🏆 Calculating achievements and progress for user:', req.userId);
      
      // Get all user's entries and user data
      const allEntries = await storage.getJournalEntriesByUserId(req.userId, 1000);
      const user = await storage.getUser(req.userId);
      
      const potentialAchievements: Array<{
        id: string;
        title: string;
        description: string;
        icon: string;
        type: 'milestone' | 'streak' | 'social' | 'content';
        progress: number;
        target: number;
        completed: boolean;
        completedDate?: string;
      }> = [];

      // Sort entries by creation date (most recent first)
      const sortedEntries = (allEntries || []).sort((a, b) => 
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );

      const now = new Date();
      const entryCount = sortedEntries.length;
      
      // Helper function to format completion date
      const getCompletionDate = (date: Date) => {
        const daysDiff = Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
        if (daysDiff === 0) return 'Today';
        if (daysDiff === 1) return 'Yesterday';
        if (daysDiff < 7) return `${daysDiff} days ago`;
        if (daysDiff < 30) return `${Math.floor(daysDiff / 7)} week${Math.floor(daysDiff / 7) > 1 ? 's' : ''} ago`;
        return `${Math.floor(daysDiff / 30)} month${Math.floor(daysDiff / 30) > 1 ? 's' : ''} ago`;
      };

      // Calculate current streak
      const todayUTC = new Date();
      todayUTC.setUTCHours(0, 0, 0, 0);
      
      const entriesByDate = new Map<string, number>();
      sortedEntries.forEach(entry => {
        if (entry.createdAt) {
          const dateStr = new Date(entry.createdAt).toISOString().split('T')[0];
          entriesByDate.set(dateStr, (entriesByDate.get(dateStr) || 0) + 1);
        }
      });

      let currentStreak = 0;
      let currentDate = new Date(todayUTC);
      while (true) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (entriesByDate.has(dateStr)) {
          currentStreak++;
          currentDate.setUTCDate(currentDate.getUTCDate() - 1);
        } else {
          break;
        }
      }

      // Count different content types
      const voiceEntriesCount = sortedEntries.filter(entry => entry.audioUrl).length;
      const mediaEntriesCount = sortedEntries.filter(entry => entry.mediaUrls && entry.mediaUrls.length > 0).length;
      const sharedEntriesCount = sortedEntries.filter(entry => entry.privacy === 'shared' || entry.privacy === 'public').length;
      const publicEntriesCount = sortedEntries.filter(entry => entry.privacy === 'public').length;

      // Define potential achievements with progress tracking
      
      // 1. First Entry Achievement
      potentialAchievements.push({
        id: 'first-entry',
        title: 'First Steps',
        description: 'Create your first journal entry',
        icon: 'BookOpen',
        type: 'milestone',
        progress: Math.min(entryCount, 1),
        target: 1,
        completed: entryCount >= 1,
        completedDate: entryCount >= 1 && sortedEntries.length > 0 ? 
          getCompletionDate(new Date(sortedEntries[sortedEntries.length - 1].createdAt || Date.now())) : undefined
      });

      // 2. Entry Count Milestones
      const entryMilestones = [10, 25, 50];
      for (const milestone of entryMilestones) {
        potentialAchievements.push({
          id: `entries-${milestone}`,
          title: milestone === 10 ? 'Dedicated Writer' : milestone === 25 ? 'Committed Journalist' : 'Devoted Chronicler',
          description: `Write ${milestone} journal entries`,
          icon: 'Trophy',
          type: 'milestone',
          progress: Math.min(entryCount, milestone),
          target: milestone,
          completed: entryCount >= milestone,
          completedDate: entryCount >= milestone && sortedEntries.length >= milestone ? 
            getCompletionDate(new Date(sortedEntries[sortedEntries.length - milestone].createdAt || Date.now())) : undefined
        });
      }

      // 3. Voice Recording Achievement
      potentialAchievements.push({
        id: 'first-voice',
        title: 'Voice Activated',
        description: 'Record your first voice entry',
        icon: 'Mic',
        type: 'content',
        progress: Math.min(voiceEntriesCount, 1),
        target: 1,
        completed: voiceEntriesCount >= 1,
        completedDate: voiceEntriesCount >= 1 ? 
          getCompletionDate(new Date(sortedEntries.find(e => e.audioUrl)?.createdAt || Date.now())) : undefined
      });

      // 4. Photo Achievement
      potentialAchievements.push({
        id: 'first-photo',
        title: 'Picture Perfect',
        description: 'Add a photo to your entry',
        icon: 'Camera',
        type: 'content',
        progress: Math.min(mediaEntriesCount, 1),
        target: 1,
        completed: mediaEntriesCount >= 1,
        completedDate: mediaEntriesCount >= 1 ? 
          getCompletionDate(new Date(sortedEntries.find(e => e.mediaUrls && e.mediaUrls.length > 0)?.createdAt || Date.now())) : undefined
      });

      // 5. Social Sharing Achievement
      potentialAchievements.push({
        id: 'first-share',
        title: 'Social Butterfly',
        description: 'Share your first entry',
        icon: 'Share2',
        type: 'social',
        progress: Math.min(sharedEntriesCount, 1),
        target: 1,
        completed: sharedEntriesCount >= 1,
        completedDate: sharedEntriesCount >= 1 ? 
          getCompletionDate(new Date(sortedEntries.find(e => e.privacy === 'shared' || e.privacy === 'public')?.createdAt || Date.now())) : undefined
      });

      // 6. Streak Achievements
      const streakTargets = [3, 7, 14];
      for (const target of streakTargets) {
        potentialAchievements.push({
          id: `streak-${target}`,
          title: target === 3 ? 'On Fire' : target === 7 ? 'Week Warrior' : 'Consistency Master',
          description: `Maintain ${target} day writing streak`,
          icon: target === 3 ? 'Flame' : 'Award',
          type: 'streak',
          progress: Math.min(currentStreak, target),
          target: target,
          completed: currentStreak >= target,
          completedDate: currentStreak >= target ? 'Active streak' : undefined
        });
      }

      // Sort by priority: completed milestones first (show progress), then incomplete (encourage progress)
      potentialAchievements.sort((a, b) => {
        // Prioritize completed milestone achievements (especially important ones like "First Steps")
        if (a.completed && !b.completed && a.type === 'milestone') {
          return -1;
        }
        if (b.completed && !a.completed && b.type === 'milestone') {
          return 1;
        }
        
        // Then separate by completion status
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1; // Incomplete achievements second (to encourage progress)
        }
        
        // Within same completion status, sort by target difficulty (easier first)
        return a.target - b.target;
      });

      // Limit to top 5 most relevant achievements
      const relevantAchievements = potentialAchievements.slice(0, 5);
      
      console.log('🏆 Potential achievements calculated:', relevantAchievements.length, 'achievements');
      res.json({ achievements: relevantAchievements });
      
    } catch (error) {
      console.error('Achievements calculation error:', error);
      res.status(500).json({ error: 'Failed to calculate achievements' });
    }
  });

  // === PERSON MANAGEMENT ROUTES ===
  
  // Get all people for the current user
  app.get('/api/people', async (req, res) => {
    try {
      const people = await storage.getPersonsByUserId(req.userId);
      res.json(people);
    } catch (error) {
      console.error('Get People Error:', error);
      res.status(500).json({ error: 'Failed to fetch people' });
    }
  });

  // Create a new person
  app.post('/api/people', async (req, res) => {
    try {
      const personData = insertPersonSchema.parse(req.body);
      const person = await storage.createPerson(personData, req.userId);
      res.status(201).json(person);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid person data', details: error.errors });
      }
      console.error('Create Person Error:', error);
      res.status(500).json({ error: 'Failed to create person' });
    }
  });

  // Get a specific person by ID
  app.get('/api/people/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const person = await storage.getPerson(id);
      
      if (!person) {
        return res.status(404).json({ error: 'Person not found' });
      }
      
      // Verify person belongs to the user
      if (person.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to access this person' });
      }
      
      res.json(person);
    } catch (error) {
      console.error('Get Person Error:', error);
      res.status(500).json({ error: 'Failed to fetch person' });
    }
  });

  // Update a person
  app.put('/api/people/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = insertPersonSchema.partial().parse(req.body);
      
      // Verify person exists and belongs to the user
      const existingPerson = await storage.getPerson(id);
      if (!existingPerson) {
        return res.status(404).json({ error: 'Person not found' });
      }
      
      if (existingPerson.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to update this person' });
      }
      
      const updatedPerson = await storage.updatePerson(id, updates);
      res.json(updatedPerson);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid person data', details: error.errors });
      }
      console.error('Update Person Error:', error);
      res.status(500).json({ error: 'Failed to update person' });
    }
  });

  // Delete a person
  app.delete('/api/people/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify person exists and belongs to the user
      const existingPerson = await storage.getPerson(id);
      if (!existingPerson) {
        return res.status(404).json({ error: 'Person not found' });
      }
      
      if (existingPerson.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to delete this person' });
      }
      
      await storage.deletePerson(id);
      res.status(204).send(); // 204 No Content for successful deletion
    } catch (error) {
      console.error('Delete Person Error:', error);
      res.status(500).json({ error: 'Failed to delete person' });
    }
  });

  // Search people by name
  app.get('/api/people/search/:query', async (req, res) => {
    try {
      const { query } = req.params;
      if (!query || query.trim().length === 0) {
        return res.status(400).json({ error: 'Search query is required' });
      }
      
      const people = await storage.searchPersonsByUserId(req.userId, query.trim());
      res.json(people);
    } catch (error) {
      console.error('Search People Error:', error);
      res.status(500).json({ error: 'Failed to search people' });
    }
  });

  // === PERSON TAGGING ROUTES ===
  
  // Get person tags for a specific entry
  app.get('/api/journal/entries/:entryId/people', async (req, res) => {
    try {
      const { entryId } = req.params;
      
      // Verify entry exists and user has access to it
      const entry = await storage.getJournalEntry(entryId);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      const canAccess = 
        entry.userId === req.userId || // Owner can always access
        entry.privacy === 'public' || // Public entries allow anyone to view
        (entry.privacy === 'shared' && entry.sharedWith?.includes(req.userId)); // Shared with user
      
      if (!canAccess) {
        return res.status(403).json({ error: 'Not authorized to view this entry' });
      }
      
      // Get person tags, filtered by user (privacy-aware)
      const personTags = await storage.getPersonTagsByEntryId(entryId, req.userId);
      res.json(personTags);
    } catch (error) {
      console.error('Get Person Tags Error:', error);
      res.status(500).json({ error: 'Failed to fetch person tags' });
    }
  });

  // Tag a person in an entry
  app.post('/api/journal/entries/:entryId/people/:personId', async (req, res) => {
    try {
      const { entryId, personId } = req.params;
      
      // Verify entry exists and belongs to the user (only owners can tag people)
      const entry = await storage.getJournalEntry(entryId);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      if (entry.userId !== req.userId) {
        return res.status(403).json({ error: 'Only entry owners can tag people' });
      }
      
      // Verify person exists and belongs to the user
      const person = await storage.getPerson(personId);
      if (!person) {
        return res.status(404).json({ error: 'Person not found' });
      }
      
      if (person.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to use this person' });
      }
      
      const personTag = await storage.tagPersonInEntry(entryId, personId);
      res.status(201).json(personTag);
    } catch (error) {
      console.error('Tag Person Error:', error);
      res.status(500).json({ error: 'Failed to tag person' });
    }
  });

  // Untag a person from an entry
  app.delete('/api/journal/entries/:entryId/people/:personId', async (req, res) => {
    try {
      const { entryId, personId } = req.params;
      
      // Verify entry exists and belongs to the user (only owners can untag people)
      const entry = await storage.getJournalEntry(entryId);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      if (entry.userId !== req.userId) {
        return res.status(403).json({ error: 'Only entry owners can untag people' });
      }
      
      await storage.untagPersonFromEntry(entryId, personId);
      res.status(204).send(); // 204 No Content for successful deletion
    } catch (error) {
      console.error('Untag Person Error:', error);
      res.status(500).json({ error: 'Failed to untag person' });
    }
  });

  // Get all entries for a specific person
  app.get('/api/people/:personId/entries', async (req, res) => {
    try {
      const { personId } = req.params;
      
      // Verify person exists and belongs to the user
      const person = await storage.getPerson(personId);
      if (!person) {
        return res.status(404).json({ error: 'Person not found' });
      }
      
      if (person.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to access this person' });
      }
      
      const entries = await storage.getEntriesByPersonId(personId, req.userId);
      res.json(entries);
    } catch (error) {
      console.error('Get Entries by Person Error:', error);
      res.status(500).json({ error: 'Failed to fetch entries for person' });
    }
  });

  // === PERSON NAME SUGGESTIONS ===
  
  // Get suggestions for creating Person objects from detected names in a journal entry
  app.get('/api/journal/entries/:entryId/person-suggestions', async (req, res) => {
    try {
      const { entryId } = req.params;
      
      // Verify entry exists and belongs to the user
      const entry = await storage.getJournalEntry(entryId);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      if (entry.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to access this entry' });
      }
      
      // Get AI insights for the entry
      const aiInsights = await storage.getAiInsights(entryId);
      if (!aiInsights) {
        return res.json({ suggestions: [] }); // No AI insights available
      }
      
      // Extract mentioned people from AI insights
      const mentionedPeople: string[] = aiInsights.people || [];
      
      if (!mentionedPeople || mentionedPeople.length === 0) {
        return res.json({ suggestions: [] });
      }
      
      // Get existing people for the user to avoid duplicate suggestions
      const existingPeople = await storage.getPersonsByUserId(req.userId);
      const existingNames = new Set(
        existingPeople.map(person => 
          `${person.firstName || ''} ${person.lastName || ''}`.trim().toLowerCase()
        ).concat(
          existingPeople.map(person => person.firstName?.toLowerCase()).filter(Boolean)
        )
      );
      
      // Filter out names that already exist as Person objects
      const newNames = mentionedPeople.filter(name => 
        !existingNames.has(name.toLowerCase()) && 
        name.length > 0 && 
        name.length < 100 // Reasonable name length
      );
      
      // Create suggestions for new names
      const suggestions = newNames.map(name => {
        // Try to split into first and last name
        const nameParts = name.trim().split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
        
        return {
          originalText: name,
          firstName,
          lastName,
          notes: `Mentioned in journal entry: "${entry.title || 'Untitled'}"`,
          // Include entry context for better suggestions
          entryId: entryId,
          confidence: name.length > 1 && /^[A-Za-z\s'-]+$/.test(name) ? 'high' : 'medium'
        };
      });
      
      res.json({ 
        suggestions,
        entryTitle: entry.title,
        entryContent: entry.content?.substring(0, 200) + (entry.content?.length > 200 ? '...' : '')
      });
    } catch (error) {
      console.error('Get Person Suggestions Error:', error);
      res.status(500).json({ error: 'Failed to get person suggestions' });
    }
  });

  // Get aggregated person suggestions from recent journal entries
  app.get('/api/people/suggestions', async (req, res) => {
    try {
      const userId = req.userId;
      
      // Get recent entries (limit to 5 for performance)
      const recentEntries = await storage.getJournalEntriesByUserId(userId, 5);
      
      if (recentEntries.length === 0) {
        return res.json({ suggestions: [] });
      }
      
      // Get existing people to filter out duplicates
      const existingPeople = await storage.getPersonsByUserId(userId);
      const existingNames = new Set(
        existingPeople.map(person => 
          `${person.firstName || ''} ${person.lastName || ''}`.trim().toLowerCase()
        ).concat(
          existingPeople.map(person => person.firstName?.toLowerCase()).filter(Boolean)
        )
      );
      
      // Collect all suggestions from entries with AI insights
      const allSuggestions: Array<{
        entryId: string;
        entryTitle: string;
        originalText: string;
        firstName: string;
        lastName: string | null;
        notes: string;
        confidence: 'high' | 'medium' | 'low';
      }> = [];
      
      for (const entry of recentEntries) {
        try {
          // Get AI insights for this entry
          const aiInsights = await storage.getAiInsights(entry.id);
          if (!aiInsights) continue;
          
          // Parse mentioned people from AI insights
          let mentionedPeople: string[] = [];
          try {
            if (typeof aiInsights === 'object' && aiInsights !== null) {
              // Handle both string and object formats
              const insights = typeof aiInsights === 'string' ? JSON.parse(aiInsights) : aiInsights;
              mentionedPeople = (insights as any).mentionedPeople || [];
            }
          } catch (parseError) {
            console.error('Error parsing AI insights for entry:', entry.id, parseError);
            continue;
          }
          
          if (!mentionedPeople || mentionedPeople.length === 0) continue;
          
          // Filter out existing names and create suggestions
          const newNames = mentionedPeople.filter(name => 
            !existingNames.has(name.toLowerCase()) && 
            name.length > 0 && 
            name.length < 100 // Reasonable name length
          );
          
          for (const name of newNames) {
            const nameParts = name.trim().split(/\s+/);
            const firstName = nameParts[0];
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
            
            allSuggestions.push({
              entryId: entry.id,
              entryTitle: entry.title || 'Untitled Entry',
              originalText: name,
              firstName,
              lastName,
              notes: `Mentioned in journal entry: "${entry.title || 'Untitled'}"`,
              confidence: name.length > 1 && /^[A-Za-z\s'-]+$/.test(name) ? 'high' : 'medium'
            });
          }
        } catch (error) {
          console.error('Error processing suggestions for entry:', entry.id, error);
          // Continue with other entries
        }
      }
      
      // Deduplicate suggestions by normalized name
      const uniqueSuggestions = new Map<string, typeof allSuggestions[0]>();
      for (const suggestion of allSuggestions) {
        const normalizedName = `${suggestion.firstName} ${suggestion.lastName || ''}`.trim().toLowerCase();
        if (!uniqueSuggestions.has(normalizedName)) {
          uniqueSuggestions.set(normalizedName, suggestion);
        }
      }
      
      res.json({ 
        suggestions: Array.from(uniqueSuggestions.values()),
        totalEntries: recentEntries.length
      });
    } catch (error) {
      console.error('Get Person Suggestions Error:', error);
      res.status(500).json({ error: 'Failed to get person suggestions' });
    }
  });

  // Create multiple Person objects from suggestions
  app.post('/api/people/batch', async (req, res) => {
    try {
      const batchSchema = z.object({
        people: z.array(insertPersonSchema).max(10) // Limit to 10 people at once
      });
      
      const { people } = batchSchema.parse(req.body);
      
      if (people.length === 0) {
        return res.status(400).json({ error: 'No people provided' });
      }
      
      const createdPeople = [];
      const errors = [];
      
      for (const personData of people) {
        try {
          const person = await storage.createPerson(personData, req.userId);
          createdPeople.push(person);
        } catch (error) {
          errors.push({
            personData,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      res.status(201).json({
        created: createdPeople,
        errors,
        totalRequested: people.length,
        totalCreated: createdPeople.length,
        totalErrors: errors.length
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid batch data', details: error.errors });
      }
      console.error('Batch Create People Error:', error);
      res.status(500).json({ error: 'Failed to create people in batch' });
    }
  });

  // Get historical tags used by user (for filter dropdown)
  app.get('/api/filters/tags', async (req, res) => {
    try {
      const userId = req.userId;
      const tags = await storage.getHistoricalTagsByUserId(userId);
      res.json(tags);
    } catch (error) {
      console.error('Get Historical Tags Error:', error);
      res.status(500).json({ error: 'Failed to get historical tags' });
    }
  });

  // Get historical people tagged by user (for filter dropdown)
  app.get('/api/filters/people', async (req, res) => {
    try {
      const userId = req.userId;
      const people = await storage.getHistoricalPeopleByUserId(userId);
      res.json(people);
    } catch (error) {
      console.error('Get Historical People Error:', error);
      res.status(500).json({ error: 'Failed to get historical people' });
    }
  });

  // Bulk fetch journal entries by IDs
  app.post('/api/journal/entries/bulk', async (req, res) => {
    try {
      const { entryIds } = req.body;
      
      if (!Array.isArray(entryIds) || entryIds.length === 0) {
        return res.status(400).json({ error: 'entryIds array is required' });
      }
      
      if (entryIds.length > 50) {
        return res.status(400).json({ error: 'Too many entries requested (max 50)' });
      }
      
      // Fetch entries with user data, only returning entries the user can access
      const entries = await storage.getBulkJournalEntriesWithUser(entryIds, req.userId);
      res.json(entries);
    } catch (error: any) {
      console.error('Error fetching bulk entries:', error);
      res.status(500).json({ error: 'Failed to fetch entries' });
    }
  });



  // Search journal entries endpoint  
  app.post(['/api/search', '/api/journal/search'], async (req, res) => {
    try {
      const searchSchema = z.object({
        query: z.string().min(1, 'Search query is required'),
        mode: z.enum(['keyword', 'semantic']).default('keyword'),
        filters: z.object({
          privacy: z.array(z.enum(['private', 'shared', 'public'])).optional(),
          tags: z.array(z.string()).optional(),
          dateRange: z.object({
            from: z.string().datetime().optional(),
            to: z.string().datetime().optional()
          }).optional(),
          sentiment: z.enum(['positive', 'negative', 'neutral']).optional()
        }).optional(),
        limit: z.number().int().min(1).max(50).default(20)
      });

      const { query, mode, filters = {}, limit } = searchSchema.parse(req.body);
      
      console.log('🔍 Search request:', { query, mode, userId: req.userId });

      // Get user's journal entries 
      const allEntries = await storage.getJournalEntriesByUserId(req.userId, 100); // Get more for filtering
      
      let filteredEntries = allEntries;

      // Apply privacy filters if specified
      if (filters.privacy && filters.privacy.length > 0) {
        filteredEntries = filteredEntries.filter(entry => 
          filters.privacy!.includes(entry.privacy as any)
        );
      }

      // Apply tag filters if specified
      if (filters.tags && filters.tags.length > 0) {
        filteredEntries = filteredEntries.filter(entry =>
          filters.tags!.some(tag => 
            (entry.tags || []).some(entryTag => 
              entryTag.toLowerCase().includes(tag.toLowerCase())
            )
          )
        );
      }

      // Apply date range filters if specified
      if (filters.dateRange) {
        if (filters.dateRange.from) {
          const fromDate = new Date(filters.dateRange.from);
          filteredEntries = filteredEntries.filter(entry => 
            entry.createdAt && new Date(entry.createdAt) >= fromDate
          );
        }
        if (filters.dateRange.to) {
          const toDate = new Date(filters.dateRange.to);
          filteredEntries = filteredEntries.filter(entry => 
            entry.createdAt && new Date(entry.createdAt) <= toDate
          );
        }
      }

      // Apply sentiment filter if specified  
      if (filters.sentiment) {
        filteredEntries = filteredEntries.filter(entry =>
          entry.aiInsights?.sentiment === filters.sentiment
        );
      }

      let searchResults = [];

      if (mode === 'keyword') {
        // Keyword-based search
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter(word => word.length > 0);

        for (const entry of filteredEntries) {
          const matches = [];
          let totalScore = 0;

          // Search in title
          if (entry.title && entry.title.toLowerCase().includes(queryLower)) {
            matches.push({ field: 'title', snippet: entry.title, score: 0.9 });
            totalScore += 0.9;
          }

          // Search in content
          const contentLower = (entry.content || '').toLowerCase();
          if (contentLower.includes(queryLower)) {
            const snippetStart = Math.max(0, contentLower.indexOf(queryLower) - 50);
            const snippetEnd = Math.min(entry.content.length, snippetStart + 200);
            const snippet = entry.content.substring(snippetStart, snippetEnd);
            matches.push({ field: 'content', snippet: `...${snippet}...`, score: 0.8 });
            totalScore += 0.8;
          }

          // Search in tags
          const matchingTags = (entry.tags || []).filter(tag => 
            queryWords.some(word => tag.toLowerCase().includes(word))
          );
          if (matchingTags.length > 0) {
            matches.push({ 
              field: 'tags', 
              snippet: matchingTags.join(', '), 
              score: 0.7 * matchingTags.length 
            });
            totalScore += 0.7 * matchingTags.length;
          }

          // Search in AI insights if available
          if (entry.aiInsights) {
            // Search keywords
            const matchingKeywords = entry.aiInsights.keywords?.filter(keyword =>
              queryWords.some(word => keyword.toLowerCase().includes(word))
            ) || [];
            
            if (matchingKeywords.length > 0) {
              matches.push({
                field: 'keywords',
                snippet: matchingKeywords.join(', '),
                score: 0.6 * matchingKeywords.length
              });
              totalScore += 0.6 * matchingKeywords.length;
            }

            // Search entities
            const matchingEntities = entry.aiInsights.entities?.filter(entity =>
              queryWords.some(word => entity.toLowerCase().includes(word))
            ) || [];
            
            if (matchingEntities.length > 0) {
              matches.push({
                field: 'entities',
                snippet: matchingEntities.join(', '),
                score: 0.6 * matchingEntities.length
              });
              totalScore += 0.6 * matchingEntities.length;
            }

            // Search labels (for media content)
            const matchingLabels = entry.aiInsights.labels?.filter(label =>
              queryWords.some(word => label.toLowerCase().includes(word))
            ) || [];
            
            if (matchingLabels.length > 0) {
              matches.push({
                field: 'labels',
                snippet: matchingLabels.join(', '),
                score: 0.5 * matchingLabels.length
              });
              totalScore += 0.5 * matchingLabels.length;
            }

            // Search people mentions
            const matchingPeople = entry.aiInsights.people?.filter(person =>
              queryWords.some(word => person.toLowerCase().includes(word))
            ) || [];
            
            if (matchingPeople.length > 0) {
              matches.push({
                field: 'people',
                snippet: matchingPeople.join(', '),
                score: 0.5 * matchingPeople.length
              });
              totalScore += 0.5 * matchingPeople.length;
            }
          }

          if (matches.length > 0) {
            searchResults.push({
              entry,
              matches,
              confidence: Math.min(totalScore, 1.0), // Cap at 1.0
              matchReason: `Found ${matches.length} matches: ${matches.map(m => m.field).join(', ')}`
            });
          }
        }

        // Sort by confidence score (highest first)
        searchResults.sort((a, b) => b.confidence - a.confidence);

      } else {
        // Semantic search mode
        console.log('🧠 Performing semantic search');
        
        // Use intelligent semantic ranking
        const rankedEntries = await semanticRank(query, filteredEntries as any[]);
        
        // Convert to search results format using actual semantic scores
        searchResults = rankedEntries.slice(0, limit).map(entry => {
          const semanticScore = entry._semanticScore || 0;
          const matchReasons = entry._matchReasons || [];
          
          return {
            entry: { ...entry, _semanticScore: undefined, _matchReasons: undefined }, // Clean up internal fields
            matches: [{
              field: 'semantic',
              snippet: entry.aiInsights?.summary || entry.content.substring(0, 200) + '...',
              score: Math.min(semanticScore, 1.0) // Use actual semantic score
            }],
            confidence: Math.min(semanticScore, 1.0), // Use actual confidence from ranking
            matchReason: matchReasons.length > 0 ? matchReasons.join('; ') : 'Semantic similarity match'
          };
        });
      }

      // Apply limit and return results
      const limitedResults = searchResults.slice(0, limit);

      console.log(`🔍 Search completed: ${limitedResults.length} results for "${query}" (${mode} mode)`);

      res.json({
        query,
        mode,
        totalResults: limitedResults.length,
        results: limitedResults,
        executionTime: Date.now() - Date.now() // Placeholder
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid search parameters', details: error.errors });
      }
      console.error('Search Error:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  // Re-analyze old entries that are missing image analysis
  app.post('/api/journal/reanalyze-entries', async (req, res) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      console.log('🔄 Starting re-analysis of entries with missing image insights...');

      // Get all entries for the user
      const allEntries = await storage.getJournalEntriesByUserId(userId);
      
      // Find entries that have media but missing/empty image analysis 
      const entriesNeedingReanalysis = allEntries.filter(entry => {
        const hasMedia = entry.mediaUrls && entry.mediaUrls.length > 0;
        const hasEmptyLabels = !entry.aiInsights?.labels || entry.aiInsights.labels.length === 0;
        return hasMedia && hasEmptyLabels;
      });

      console.log(`📊 Found ${entriesNeedingReanalysis.length} entries with media that need image re-analysis`);

      if (entriesNeedingReanalysis.length === 0) {
        return res.json({
          message: 'No entries need re-analysis',
          reanalyzedCount: 0,
          entriesChecked: allEntries.length
        });
      }

      let reanalyzedCount = 0;
      const errors = [];

      // Re-analyze each entry
      for (const entry of entriesNeedingReanalysis) {
        try {
          console.log(`🤖 Re-analyzing entry: ${entry.title} (${entry.id})`);
          
          // Perform AI analysis for this entry
          const newAiInsights = await analyzeEntry(
            entry.content || '', 
            entry.title, 
            entry.mediaUrls || []
          );

          // Update the entry with new AI insights
          await storage.updateAiInsights(entry.id, newAiInsights);
          
          console.log(`✨ Updated insights for "${entry.title}": ${newAiInsights.labels?.length || 0} labels, ${newAiInsights.keywords?.length || 0} keywords`);
          reanalyzedCount++;
          
        } catch (error) {
          console.error(`❌ Failed to re-analyze entry ${entry.id}:`, error);
          errors.push({
            entryId: entry.id,
            title: entry.title,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      console.log(`🎉 Re-analysis completed: ${reanalyzedCount}/${entriesNeedingReanalysis.length} entries updated`);

      res.json({
        message: `Successfully re-analyzed ${reanalyzedCount} entries`,
        reanalyzedCount,
        entriesChecked: allEntries.length,
        entriesNeedingReanalysis: entriesNeedingReanalysis.length,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      console.error('Re-analysis Error:', error);
      res.status(500).json({ error: 'Failed to re-analyze entries' });
    }
  });

  // Convert localhost image URLs to public Replit URLs for OpenAI access
  app.post('/api/journal/convert-image-urls', async (req, res) => {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      console.log('🔗 Converting localhost URLs to public Replit URLs...');

      // Get all entries with images
      const entries = await storage.getJournalEntriesByUserId(userId);
      const entriesWithImages = entries.filter(entry => 
        entry.mediaUrls && entry.mediaUrls.length > 0
      );

      console.log(`📸 Found ${entriesWithImages.length} entries with images to convert`);

      let convertedCount = 0;
      // Get the current Replit domain from environment variables
      const replitDomain = process.env.REPLIT_DEV_DOMAIN || 'localhost:5000';
      const protocol = replitDomain.includes('.replit.dev') ? 'https' : 'http';

      for (const entry of entriesWithImages) {
        if (!entry.mediaUrls) continue;

        const newMediaUrls = [];
        let hasChanges = false;

        for (const mediaUrl of entry.mediaUrls) {
          if (mediaUrl.startsWith('/objects/uploads/')) {
            // Convert to full public URL
            const publicUrl = `${protocol}://${replitDomain}${mediaUrl}`;
            console.log(`🔄 Converting ${mediaUrl} → ${publicUrl}`);
            newMediaUrls.push(publicUrl);
            hasChanges = true;
          } else {
            // Keep URLs that are already public or external
            newMediaUrls.push(mediaUrl);
          }
        }

        // Update the entry if we have changes
        if (hasChanges) {
          await storage.updateJournalEntry(entry.id, { mediaUrls: newMediaUrls });
          convertedCount++;
          console.log(`🎯 Updated entry: "${entry.title}" with public URLs`);
        }
      }

      console.log(`🎉 Successfully converted ${convertedCount} entries to use public URLs`);

      res.json({
        message: 'Image URLs converted to public Replit URLs successfully',
        entriesProcessed: entriesWithImages.length,
        entriesConverted: convertedCount,
        exampleUrl: `${protocol}://${replitDomain}/objects/uploads/example-id`
      });

    } catch (error) {
      console.error('❌ Error converting image URLs:', error);
      res.status(500).json({ 
        error: 'Failed to convert image URLs',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Analyze existing entries that don't have AI insights
  app.post('/api/journal/analyze-missing', async (req, res) => {
    const userId = req.userId; // Use authenticated user ID for security

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      console.log('🔄 Starting analysis of existing entries without AI insights...');
      
      // Get entries that have media but no AI insights OR empty labels (failed image analysis)
      const entriesNeedingAnalysis = await storage.getJournalEntriesByUserId(userId);
      const entriesToAnalyze = entriesNeedingAnalysis.filter((entry: any) => {
        // Has media URLs
        if (!entry.mediaUrls || entry.mediaUrls.length === 0) {
          console.log(`  ❌ Skipping "${entry.title}" - no media URLs`);
          return false;
        }
        
        console.log(`  🔍 Checking "${entry.title}":`, {
          hasAiInsights: !!entry.aiInsights,
          hasLabels: !!(entry.aiInsights?.labels),
          labelsCount: entry.aiInsights?.labels?.length || 0
        });
        
        // FORCE REPROCESS ALL ENTRIES WITH MEDIA URLS - We need to regenerate embeddings
        console.log(`  ✅ Including "${entry.title}" for reprocessing`);
        return true;
      });

      console.log(`📊 Found ${entriesToAnalyze.length} entries that need AI analysis`);

      let analyzed = 0;
      let errors = 0;

      // Analyze entries one by one to avoid rate limits
      for (const entry of entriesToAnalyze) {
        try {
          console.log(`🤖 Analyzing entry: "${entry.title || entry.id.substring(0, 8)}"...`);
          
          // Use enhanced analysis to generate insights with working gpt-4o model
          const { enhancedAnalyzeEntry } = await import('./services/enhancedOpenAI');
          const aiInsights = await enhancedAnalyzeEntry(
            entry.content ?? '', 
            entry.title ?? undefined, 
            entry.mediaUrls ?? [],
            entry.audioUrl ?? undefined,
            entry.tags ?? []
          );

          // Update the entry with AI insights
          await storage.updateAiInsights(entry.id, aiInsights);
          
          analyzed++;
          console.log(`✅ Successfully analyzed "${entry.title || entry.id.substring(0, 8)}"`);
          
          // Small delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`❌ Failed to analyze entry ${entry.id}:`, error);
          errors++;
        }
      }

      console.log(`🎉 Analysis complete: ${analyzed} analyzed, ${errors} errors`);
      
      return res.json({ 
        message: 'Analysis completed', 
        analyzed, 
        errors,
        totalFound: entriesToAnalyze.length 
      });
      
    } catch (error) {
      console.error('❗ Error analyzing existing entries:', error);
      return res.status(500).json({ error: 'Failed to analyze entries' });
    }
  });

  // Reprocess ALL entries for ALL users (Development Database only) - No auth required for system operations
  app.post('/api/journal/reprocess-all-users', async (req, res) => {
    try {
      // Prevent concurrent reprocessing runs
      if (reprocessingInProgress) {
        return res.status(429).json({ error: 'Reprocessing already in progress. Please wait.' });
      }
      
      // Rate limiting: Check cooldown per user/IP
      const userId = req.userId || req.ip || 'anonymous';
      const now = Date.now();
      const lastRun = reprocessingCooldown.get(userId) || 0;
      const cooldownMs = 30 * 60 * 1000; // 30 minutes
      
      if (now - lastRun < cooldownMs) {
        const remainingMs = cooldownMs - (now - lastRun);
        const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
        return res.status(429).json({ 
          error: `Rate limit exceeded. Please wait ${remainingMinutes} minutes before retrying.` 
        });
      }
      
      // Set processing flag and update cooldown
      reprocessingInProgress = true;
      reprocessingCooldown.set(userId, now);
      
      // Critical security checks for production
      if (process.env.NODE_ENV === 'production') {
        // Require explicit enable flag
        if (process.env.ENABLE_REPROCESS_ALL !== 'true') {
          return res.status(503).json({ error: 'Comprehensive reprocessing is disabled in production' });
        }
        
        // Require admin authentication
        const adminSecret = req.headers['x-admin-secret'];
        if (adminSecret !== process.env.ADMIN_REPROCESS_SECRET) {
          return res.status(403).json({ error: 'Admin access required for production reprocessing' });
        }
        
        // Verify user is in admin whitelist
        const adminUserIds = (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean);
        if (!req.userId || !adminUserIds.includes(req.userId)) {
          return res.status(403).json({ error: 'Admin user access required' });
        }
      }
      
      console.log('🌍 Starting comprehensive reprocessing of ALL entries for ALL users in Development Database...');
      
      // Get all unique user IDs from the database
      const { db } = await import('./db');
      const { journalEntries } = await import('../shared/schema');
      const { sql } = await import('drizzle-orm');
      
      // Pre-import analysis functions to avoid repeated dynamic imports
      const { enhancedAnalyzeEntry, enhancedAnalyzeTextContent } = await import('./services/enhancedOpenAI');
      
      const userResults = await db.execute(sql`
        SELECT DISTINCT user_id 
        FROM journal_entries 
        WHERE user_id IS NOT NULL
        ORDER BY user_id
      `);
      
      const userIds = userResults.rows.map((row: any) => row.user_id);
      console.log(`👥 Found ${userIds.length} unique users in development database`);
      
      let totalAnalyzed = 0;
      let totalErrors = 0;
      let totalEntries = 0;
      
      // Process each user's entries
      for (let i = 0; i < userIds.length; i++) {
        const userId = userIds[i];
        console.log(`\n👤 Processing user ${i + 1}/${userIds.length}: ${userId}`);
        
        try {
          // Get ALL entries for this user (not just ones with media)
          const userEntries = await storage.getJournalEntriesByUserId(userId);
          console.log(`  📚 Found ${userEntries.length} entries for user ${userId}`);
          
          if (userEntries.length === 0) {
            console.log(`  ⏩ No entries found for user ${userId}, skipping...`);
            continue;
          }
          
          totalEntries += userEntries.length;
          
          // Process each entry for this user
          for (let j = 0; j < userEntries.length; j++) {
            const entry = userEntries[j];
            
            try {
              console.log(`  🔄 Processing entry ${j + 1}/${userEntries.length}: "${entry.title || entry.id.substring(0, 8)}"...`);
              
              // Use enhanced analysis for ALL entries (with or without media)
              
              let aiInsights;
              if (entry.mediaUrls && entry.mediaUrls.length > 0) {
                // Enhanced analysis for entries with media
                aiInsights = await enhancedAnalyzeEntry(
                  entry.content ?? '', 
                  entry.title ?? undefined, 
                  entry.mediaUrls ?? [],
                  entry.audioUrl ?? undefined,
                  entry.tags ?? []
                );
              } else {
                // Enhanced text-only analysis for entries without media
                const { enhancedAnalyzeTextContent } = await import('./services/enhancedOpenAI');
                const textAnalysis = await enhancedAnalyzeTextContent(
                  entry.content ?? '',
                  entry.title ?? undefined,
                  null, // no audio transcription
                  entry.tags ?? []
                );
                
                // Format as AiInsights with enhanced fields
                aiInsights = {
                  summary: textAnalysis.summary || "",
                  keywords: textAnalysis.keywords || [],
                  entities: textAnalysis.entities || [],
                  labels: [], // No media labels for text-only entries
                  people: [], // No people detected in text-only
                  sentiment: textAnalysis.sentiment || "neutral",
                  themes: textAnalysis.themes || [],
                  emotions: textAnalysis.emotions || [],
                  searchableText: textAnalysis.searchableText,
                  embedding: textAnalysis.embedding,
                  embeddingString: textAnalysis.embeddingString || ""
                };
              }

              // Update the entry with new insights
              await storage.updateAiInsights(entry.id, aiInsights);
              
              totalAnalyzed++;
              console.log(`  ✅ Successfully processed "${entry.title || entry.id.substring(0, 8)}"`);
              
              // Add throttling to prevent API rate limit issues and reduce costs
              await new Promise(resolve => setTimeout(resolve, 250));
              
            } catch (entryError) {
              console.error(`  ❌ Failed to process entry ${entry.id}:`, entryError);
              totalErrors++;
            }
          }
          
          console.log(`  🎯 User ${userId} complete: ${userEntries.length} entries processed`);
          
          // Delay between users to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (userError) {
          console.error(`❌ Failed to process user ${userId}:`, userError);
          totalErrors++;
        }
      }

      console.log(`\n🎉 Comprehensive reprocessing complete!`);
      console.log(`📊 Final Results:`);
      console.log(`  👥 Users processed: ${userIds.length}`);
      console.log(`  📚 Total entries found: ${totalEntries}`);
      console.log(`  ✅ Successfully analyzed: ${totalAnalyzed}`);
      console.log(`  ❌ Errors encountered: ${totalErrors}`);
      
      return res.json({ 
        message: 'Comprehensive reprocessing completed',
        usersProcessed: userIds.length,
        totalEntries,
        analyzed: totalAnalyzed,
        errors: totalErrors,
        successRate: totalEntries > 0 ? ((totalAnalyzed / totalEntries) * 100).toFixed(1) + '%' : '0%'
      });
      
    } catch (error) {
      console.error('❗ Error in comprehensive reprocessing:', error);
      return res.status(500).json({ error: 'Failed to reprocess entries for all users' });
    } finally {
      // Always release the processing mutex
      reprocessingInProgress = false;
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

  // Public entry detail endpoint (UUID pattern to prevent capturing "search")  
  app.get('/api/public/entries/:entryId([0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12})', async (req, res) => {
    try {
      const { entryId } = req.params;
      const userId = req.userId; // May be undefined for unauthenticated users
      
      const entry = await storage.getPublicEntryById(entryId, userId);
      
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      res.json(entry);
    } catch (error) {
      console.error('Public Entry Detail Error:', error);
      res.status(500).json({ error: 'Failed to fetch entry' });
    }
  });

  // User search endpoint for sharing
  app.get('/api/users/search', async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Search query must be at least 2 characters' });
      }
      
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);
      console.log('🔍 Searching users for:', query);
      
      // Search users by email or username
      const users = await storage.searchUsers(query, limit);
      
      // Filter out the current user from results
      const filteredUsers = users.filter(user => user.id !== req.userId);
      
      // Return public user information only
      const publicUsers = filteredUsers.map(user => ({
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      }));
      
      console.log('📋 Found users:', publicUsers.length);
      res.json(publicUsers);
    } catch (error) {
      console.error('User Search Error:', error);
      res.status(500).json({ error: 'Failed to search users' });
    }
  });

  // Add users to entry sharing
  app.post('/api/journal/entries/:id/share', async (req, res) => {
    try {
      const { id } = req.params;
      const { userIds } = req.body;
      
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: 'userIds array is required' });
      }
      
      // Verify entry exists and belongs to the user
      const entry = await storage.getJournalEntry(id);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      if (entry.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to share this entry' });
      }
      
      // Verify all user IDs exist
      for (const userId of userIds) {
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(400).json({ error: `User ${userId} not found` });
        }
      }
      
      // Add users to sharedWith list (avoid duplicates)
      const currentSharedWith = entry.sharedWith || [];
      const newSharedWith = Array.from(new Set([...currentSharedWith, ...userIds]));
      
      // Update entry with new sharing list
      const updatedEntry = await storage.updateJournalEntry(id, {
        sharedWith: newSharedWith,
        privacy: 'shared' // Ensure privacy is set to shared
      });
      
      console.log('✅ Added users to sharing:', { entryId: id, userIds, totalShared: newSharedWith.length });
      res.json({ 
        message: 'Users added to sharing', 
        sharedWith: newSharedWith,
        entry: updatedEntry 
      });
      
    } catch (error) {
      console.error('Share Entry Error:', error);
      res.status(500).json({ error: 'Failed to share entry' });
    }
  });

  // Remove users from entry sharing
  app.delete('/api/journal/entries/:id/share', async (req, res) => {
    try {
      const { id } = req.params;
      const { userIds } = req.body;
      
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: 'userIds array is required' });
      }
      
      // Verify entry exists and belongs to the user
      const entry = await storage.getJournalEntry(id);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      if (entry.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to modify sharing for this entry' });
      }
      
      // Remove users from sharedWith list
      const currentSharedWith = entry.sharedWith || [];
      const newSharedWith = currentSharedWith.filter(userId => !userIds.includes(userId));
      
      // If no users left, change privacy back to private
      const newPrivacy = newSharedWith.length > 0 ? 'shared' : 'private';
      
      // Update entry
      const updatedEntry = await storage.updateJournalEntry(id, {
        sharedWith: newSharedWith,
        privacy: newPrivacy
      });
      
      console.log('✅ Removed users from sharing:', { entryId: id, userIds, remainingShared: newSharedWith.length });
      res.json({ 
        message: 'Users removed from sharing', 
        sharedWith: newSharedWith,
        entry: updatedEntry 
      });
      
    } catch (error) {
      console.error('Unshare Entry Error:', error);
      res.status(500).json({ error: 'Failed to remove sharing' });
    }
  });

  // Get sharing information for an entry
  app.get('/api/journal/entries/:id/sharing', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify entry exists and user has access
      const entry = await storage.getJournalEntry(id);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      // Only entry owner can view sharing details
      if (entry.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to view sharing details' });
      }
      
      const sharedWith = entry.sharedWith || [];
      
      // Get user details for each shared user
      const sharedUsers = [];
      for (const userId of sharedWith) {
        const user = await storage.getUser(userId);
        if (user) {
          sharedUsers.push({
            id: user.id,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            profileImageUrl: user.profileImageUrl,
          });
        }
      }
      
      res.json({
        entryId: id,
        privacy: entry.privacy,
        sharedWith: sharedUsers
      });
      
    } catch (error) {
      console.error('Get Sharing Info Error:', error);
      res.status(500).json({ error: 'Failed to get sharing information' });
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
        userId: req.userId ?? null, // Allow null userId for public objects
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

  // Set ACL policy after photo upload and store MIME type metadata
  app.put("/api/photos", async (req, res) => {
    if (!req.body.photoURL) {
      return res.status(400).json({ error: "photoURL is required" });
    }

    // Extract optional MIME type and filename for enhanced metadata support
    const { mimeType, originalName } = req.body;

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
        const uploadTime = new Date(metadata.timeCreated || Date.now());
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

      // Return enhanced metadata for new mediaObjects format
      const responseData: any = {
        objectPath: finalObjectPath,
      };

      // Include MIME type and original name if provided for enhanced video/media support
      if (mimeType) {
        responseData.mimeType = mimeType;
      }
      if (originalName) {
        responseData.originalName = originalName;
      }

      res.status(200).json(responseData);
    } catch (error) {
      console.error("Error setting photo ACL:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // === Connection Management Routes ===
  
  // Send connection request
  app.post('/api/connections/request', async (req, res) => {
    try {
      const { recipientId } = z.object({ recipientId: z.string() }).parse(req.body);
      
      // Prevent self-connection
      if (req.userId === recipientId) {
        return res.status(400).json({ error: 'Cannot send connection request to yourself' });
      }
      
      const connection = await storage.sendConnectionRequest(req.userId, recipientId);
      
      // Use 201 Created for new resource creation
      res.status(201).json(connection);
    } catch (error: any) {
      console.error('Error sending connection request:', error);
      
      // Handle specific errors with appropriate status codes
      if (error.message.includes('already exists')) {
        return res.status(409).json({ error: 'Connection request already exists' });
      }
      if (error.message.includes('blocked')) {
        return res.status(403).json({ error: 'Cannot send request - one user has blocked the other' });
      }
      if (error.message.includes('User not found')) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.status(500).json({ error: 'Failed to send connection request' });
    }
  });

  // Accept connection request
  app.post('/api/connections/accept/:id', async (req, res) => {
    try {
      // Validate path parameter
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      
      // CRITICAL: Pass userId to enforce authorization in storage layer
      const connection = await storage.acceptConnectionRequest(id, req.userId);
      res.json(connection);
    } catch (error: any) {
      console.error('Error accepting connection request:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid connection request ID', details: error.errors });
      }
      
      // Handle specific authorization and validation errors
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Connection request not found' });
      }
      if (error.message.includes('not pending')) {
        return res.status(409).json({ error: 'Connection request is no longer pending' });
      }
      if (error.message.includes('Unauthorized')) {
        return res.status(403).json({ error: 'Not authorized to accept this connection request' });
      }
      
      res.status(500).json({ error: 'Failed to accept connection request' });
    }
  });

  // Reject connection request
  app.post('/api/connections/reject/:id', async (req, res) => {
    try {
      // Validate path parameter
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      
      // CRITICAL: Pass userId to enforce authorization in storage layer
      await storage.rejectConnectionRequest(id, req.userId);
      
      // Use 204 No Content for successful deletion
      res.status(204).send();
    } catch (error: any) {
      console.error('Error rejecting connection request:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid connection request ID', details: error.errors });
      }
      
      // Handle specific authorization and validation errors
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Connection request not found' });
      }
      if (error.message.includes('not pending')) {
        return res.status(409).json({ error: 'Connection request is no longer pending' });
      }
      if (error.message.includes('Unauthorized')) {
        return res.status(403).json({ error: 'Not authorized to reject this connection request' });
      }
      
      res.status(500).json({ error: 'Failed to reject connection request' });
    }
  });

  // Block user
  app.post('/api/connections/block', async (req, res) => {
    try {
      const { recipientId } = z.object({ recipientId: z.string() }).parse(req.body);
      
      // Prevent self-blocking
      if (req.userId === recipientId) {
        return res.status(400).json({ error: 'Cannot block yourself' });
      }
      
      const connection = await storage.blockUser(req.userId, recipientId);
      
      // Use 201 Created for new block relationship
      res.status(201).json(connection);
    } catch (error: any) {
      console.error('Error blocking user:', error);
      
      if (error.message.includes('User not found')) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.status(500).json({ error: 'Failed to block user' });
    }
  });

  // Unblock user
  app.delete('/api/connections/block/:userId', async (req, res) => {
    try {
      // Validate path parameter
      const { userId } = z.object({ userId: z.string().min(1) }).parse(req.params);
      
      // NOTE: Removed nonsensical "Cannot unblock yourself" check
      // Users should be able to unblock themselves if they previously blocked someone
      
      await storage.unblockUser(req.userId, userId);
      
      // Use 204 No Content for successful deletion
      res.status(204).send();
    } catch (error: any) {
      console.error('Error unblocking user:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid user ID', details: error.errors });
      }
      
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Block relationship not found' });
      }
      
      res.status(500).json({ error: 'Failed to unblock user' });
    }
  });

  // Get connection requests (received or sent)
  app.get('/api/connections/requests', async (req, res) => {
    try {
      const { type = 'received' } = req.query;
      
      if (type !== 'received' && type !== 'sent') {
        return res.status(400).json({ error: 'Type must be "received" or "sent"' });
      }
      
      const requests = await storage.getConnectionRequests(req.userId, type as 'received' | 'sent');
      res.json(requests);
    } catch (error: any) {
      console.error('Error fetching connection requests:', error);
      res.status(500).json({ error: 'Failed to fetch connection requests' });
    }
  });

  // Get connections (accepted connections)
  app.get('/api/connections', async (req, res) => {
    try {
      const connections = await storage.getConnections(req.userId);
      res.json(connections);
    } catch (error: any) {
      console.error('Error fetching connections:', error);
      res.status(500).json({ error: 'Failed to fetch connections' });
    }
  });

  // Get connection status with another user
  app.get('/api/connections/status/:userId', async (req, res) => {
    try {
      // Validate path parameter
      const { userId } = z.object({ userId: z.string().min(1) }).parse(req.params);
      
      // Prevent checking status with self
      if (req.userId === userId) {
        return res.status(400).json({ error: 'Cannot check connection status with yourself' });
      }
      
      const status = await storage.getConnectionStatus(req.userId, userId);
      res.json({ status: status || null });
    } catch (error: any) {
      console.error('Error checking connection status:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid user ID', details: error.errors });
      }
      
      res.status(500).json({ error: 'Failed to check connection status' });
    }
  });

  // Search public users
  app.get('/api/connections/search', async (req, res) => {
    try {
      const { q } = req.query;
      
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Search query is required' });
      }
      
      const users = await storage.searchPublicUsers(q, 20);
      res.json(users);
    } catch (error: any) {
      console.error('Error searching users:', error);
      res.status(500).json({ error: 'Failed to search users' });
    }
  });

  // Bulk create journal entries endpoint (development only)
  app.post('/api/journal/bulk-create', async (req, res) => {
    try {
      // Only allow in development environment
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Bulk creation not allowed in production' });
      }

      // Use authenticated user ID or default for development
      const userId = req.userId || '38345650';

      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Define 15 diverse journal entries
      const journalTemplates = [
        {
          title: "Morning Coffee Thoughts",
          content: "Had the most amazing coffee this morning at the local café. The barista created this beautiful latte art that made me smile. Sometimes it's the small moments that make the biggest difference in our day. I've been thinking about how these tiny pleasures add up to create our overall happiness.",
          tags: ["coffee", "morning", "mindfulness", "gratitude"]
        },
        {
          title: "Weekend Adventure",
          content: "Went hiking today and discovered a hidden waterfall. The sound of rushing water and the cool mist was incredibly refreshing. I spent about an hour just sitting on the rocks, listening to nature and feeling completely at peace. These outdoor adventures always remind me why I love exploring new places.",
          tags: ["hiking", "nature", "adventure", "peace", "outdoors"]
        },
        {
          title: "Cooking Experiment",
          content: "Tried making homemade pasta for the first time today. It was messy, flour everywhere, but the end result was surprisingly delicious! The texture was so much better than store-bought pasta. I'm definitely going to make this a regular weekend activity. Cooking from scratch feels so satisfying.",
          tags: ["cooking", "pasta", "homemade", "kitchen", "experiment"]
        },
        {
          title: "Book Club Reflections",
          content: "Tonight's book club discussion was particularly thought-provoking. We discussed themes of resilience and hope in the novel we're reading. Everyone had such different perspectives, which made the conversation rich and engaging. I love how books can bring people together and create meaningful discussions.",
          tags: ["books", "reading", "community", "discussion", "learning"]
        },
        {
          title: "Sunset Photography",
          content: "Captured some beautiful sunset photos today. The sky was painted in shades of orange, pink, and purple that seemed almost too vibrant to be real. I love how photography forces you to really observe and appreciate the beauty around us. Each sunset is unique and fleeting.",
          tags: ["photography", "sunset", "nature", "art", "beauty"]
        },
        {
          title: "Fitness Journey Progress",
          content: "Completed my first 5K run without stopping! Six months ago, I could barely run for two minutes. This journey has taught me so much about persistence and believing in myself. Every small step forward counts, and today I felt really proud of how far I've come.",
          tags: ["fitness", "running", "progress", "achievement", "health"]
        },
        {
          title: "Family Dinner Stories",
          content: "Had dinner with the family tonight and heard the most hilarious stories from my grandmother's childhood. She has such a vivid memory and tells stories with such enthusiasm. These family gatherings remind me how important it is to preserve and share our family history.",
          tags: ["family", "stories", "grandmother", "memories", "tradition"]
        },
        {
          title: "Garden Growth Update",
          content: "My tomatoes are finally starting to ripen! After months of watering, weeding, and waiting, I'm seeing the fruits of my labor. Gardening has taught me patience and given me a deeper appreciation for the food we eat. There's something magical about growing your own food.",
          tags: ["gardening", "tomatoes", "growth", "patience", "sustainability"]
        },
        {
          title: "Creative Writing Session",
          content: "Spent the afternoon working on a short story I've been developing. The characters are starting to feel real to me, and the plot is taking some unexpected turns. Writing is such a wonderful escape and allows me to explore different worlds and perspectives. Creative expression feels essential to my well-being.",
          tags: ["writing", "creativity", "story", "characters", "imagination"]
        },
        {
          title: "Volunteer Experience",
          content: "Volunteered at the local food bank today. It was eye-opening to see how many families in our community need support. The other volunteers were incredibly kind and dedicated. Giving back feels meaningful and reminds me of the importance of community care and compassion.",
          tags: ["volunteer", "community", "service", "compassion", "giving"]
        },
        {
          title: "Music Discovery",
          content: "Found an amazing new artist today through a friend's recommendation. Their music has this unique blend of jazz and electronic elements that I've never heard before. Music has this incredible power to transport you and evoke emotions. I've been listening on repeat all evening.",
          tags: ["music", "discovery", "jazz", "electronic", "emotions"]
        },
        {
          title: "Mindfulness Practice",
          content: "Started a daily meditation practice this week. Just ten minutes each morning, but I'm already noticing a difference in how I handle stress throughout the day. Being present and aware feels like a superpower in our busy, distracted world. Small practices can have big impacts.",
          tags: ["meditation", "mindfulness", "stress", "practice", "wellness"]
        },
        {
          title: "Travel Planning Dreams",
          content: "Spent the evening researching potential destinations for next year's vacation. Looking at photos of distant places and reading travel blogs fills me with excitement and wanderlust. Travel broadens perspective and creates memories that last a lifetime. Already counting down the days!",
          tags: ["travel", "planning", "adventure", "wanderlust", "dreams"]
        },
        {
          title: "Technology Learning",
          content: "Finally learned how to use that new app I've been putting off. Technology can be intimidating at first, but once you get the hang of it, it opens up so many possibilities. I'm excited about how this tool will help me be more organized and efficient in my daily life.",
          tags: ["technology", "learning", "apps", "organization", "efficiency"]
        },
        {
          title: "Seasonal Changes",
          content: "The leaves are starting to change color, and there's a crisp feeling in the air that signals autumn is approaching. I love how the seasons mark the passage of time and bring different energies and activities. Each season has its own beauty and rhythm that I try to embrace fully.",
          tags: ["autumn", "seasons", "change", "nature", "time"]
        }
      ];

      const createdEntries = [];
      const objectStorageService = new ObjectStorageService();

      // Process each photo and create corresponding journal entry
      for (let i = 1; i <= 15; i++) {
        try {
          const photoPath = path.join('Photos', `image ${i}.jpeg`);
          const template = journalTemplates[i - 1];
          
          // Read the photo file
          const photoBuffer = await fs.readFile(photoPath);
          
          // Get upload URL from object storage
          const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURL();
          
          // Upload photo using the signed URL
          const uploadResponse = await fetch(uploadURL, {
            method: 'PUT',
            body: photoBuffer,
            headers: {
              'Content-Type': 'image/jpeg'
            }
          });

          if (!uploadResponse.ok) {
            throw new Error(`Failed to upload photo ${i}: ${uploadResponse.statusText}`);
          }
          
          // Set public ACL for the uploaded image
          const aclPolicy = {
            owner: userId,
            visibility: "public" as const
          };
          await objectStorageService.trySetObjectEntityAclPolicy(objectPath, aclPolicy);
          
          // Create journal entry data
          const entryData = {
            title: template.title,
            content: template.content,
            tags: template.tags,
            mediaUrls: [objectPath],
            privacy: "public" as const,
            userId: userId
          };

          // Analyze entry with AI (same as regular creation)
          let aiInsights = null;
          try {
            const user = await storage.getUser(userId);
            const authorInfo = user ? {
              firstName: user.firstName,
              lastName: user.lastName,
              username: user.username
            } : null;
            
            const enhancedInsights = await enhancedAnalyzeEntry(
              entryData.content,
              entryData.title,
              entryData.mediaUrls,
              undefined, // no audio
              entryData.tags,
              authorInfo
            );
            
            aiInsights = enhancedInsights;
          } catch (error) {
            console.error(`❗ AI Analysis failed for entry ${i}:`, error);
          }

          // Create entry with enhanced data if available
          const createData = aiInsights && 'embeddingString' in aiInsights ? {
            ...entryData,
            searchableText: aiInsights.searchableText || undefined,
            contentEmbedding: aiInsights.embeddingString || undefined,
            embeddingVersion: 'v1' as string,
            lastEmbeddingUpdate: new Date()
          } : {
            ...entryData,
            searchableText: undefined,
            contentEmbedding: undefined,
            embeddingVersion: undefined,
            lastEmbeddingUpdate: undefined
          };
          
          const entry = await storage.createJournalEntry(createData, userId);
          
          // Update AI insights separately if analysis was successful
          if (aiInsights) {
            try {
              await storage.updateAiInsights(entry.id, aiInsights);
            } catch (error) {
              console.error(`❗ Failed to save AI insights for entry ${i}:`, error);
            }
          }
          
          createdEntries.push({
            id: entry.id,
            title: entry.title,
            photoPath: objectPath
          });
          
          console.log(`✅ Created journal entry ${i}/15: ${template.title}`);
          
        } catch (error) {
          console.error(`❌ Failed to create entry ${i}:`, error);
        }
      }

      res.json({
        success: true,
        message: `Successfully created ${createdEntries.length} journal entries`,
        entries: createdEntries
      });

    } catch (error: any) {
      console.error('❌ Bulk creation failed:', error);
      res.status(500).json({ error: 'Failed to bulk create journal entries', details: error.message });
    }
  });

  // Email sharing endpoint
  app.post('/api/journal/entries/:id/share-email', async (req, res) => {
    try {
      const { id } = req.params;
      const { email } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Valid email address is required' });
      }
      
      // Verify entry exists and belongs to the user
      const entry = await storage.getJournalEntry(id);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      if (entry.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to share this entry' });
      }
      
      // Get user information for email
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Ensure entry is public or shared for email sharing
      if (entry.privacy === 'private') {
        return res.status(400).json({ 
          error: 'Entry must be public or shared to send via email. Please update the privacy setting first.' 
        });
      }
      
      // Create preview text (first 200 characters of content)
      const preview = entry.content.length > 200 
        ? entry.content.substring(0, 200) + '...'
        : entry.content;
      
      // Generate public URL for the entry
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : req.headers.origin || 'http://localhost:5000';
      const entryUrl = `${baseUrl}/public/entry/${id}`;
      
      // Send email using the email service
      const { sendJournalEntryEmail } = await import('./services/emailService');
      const success = await sendJournalEntryEmail(email, user.email || 'noreply@journal.app', {
        entryTitle: entry.title || 'Untitled Entry',
        entryPreview: preview,
        entryUrl,
        senderName: user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.username,
        senderEmail: user.email || 'noreply@journal.app'
      });
      
      if (!success) {
        return res.status(500).json({ error: 'Failed to send email' });
      }
      
      res.json({ 
        success: true, 
        message: 'Journal entry shared successfully via email',
        entryUrl 
      });
    } catch (error) {
      console.error('Email Sharing Error:', error);
      res.status(500).json({ error: 'Failed to share journal entry via email' });
    }
  });

  // Import and mount enhanced search routes here, after authentication middleware
  const enhancedSearchRoutes = await import('./routes/enhancedSearch');
  app.use('/api', enhancedSearchRoutes.default);

  // API 404 guard - prevents HTML fallback for unknown API routes
  app.all('/api/*', (req, res) => {
    res.status(404).json({ 
      error: 'API endpoint not found', 
      path: req.path, 
      method: req.method 
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
