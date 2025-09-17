import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateAIResponse, transcribeAudio } from "./ai";
import { analyzeEntry, semanticRank } from "./services/openai";
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
    // Skip authentication for public routes only
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

  // Journal entries endpoints
  app.post('/api/journal/entries', async (req, res) => {
    try {
      const entryData = insertJournalEntrySchema.parse(req.body);
      
      // Analyze entry with AI if content or media exists
      let aiInsights = null;
      if (entryData.content || (entryData.mediaUrls && entryData.mediaUrls.length > 0)) {
        console.log('🤖 Analyzing journal entry with AI...');
        try {
          // Analyze entry content (text + media)
          aiInsights = await analyzeEntry(
            entryData.content ?? '', 
            entryData.title ?? undefined, 
            entryData.mediaUrls ?? []
          );
          
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

      const entry = await storage.createJournalEntry(entryData, req.userId);
      
      // Update AI insights separately if analysis was successful
      if (aiInsights) {
        await storage.updateAiInsights(entry.id, aiInsights);
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
      console.log('📚 Fetching entries for userId:', req.userId);
      const entries = await storage.getJournalEntriesByUserId(req.userId, limit);
      console.log('📚 Found', entries.length, 'entries');
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
      const entry = await storage.getJournalEntry(id);
      
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      
      // Verify entry belongs to the user
      if (entry.userId !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to access this entry' });
      }
      
      res.json(entry);
    } catch (error) {
      console.error('Get Entry by ID Error:', error);
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
      
      // Analyze updated content with AI if content or media changed
      if (updates.content !== undefined || updates.mediaUrls !== undefined) {
        console.log('🤖 Re-analyzing updated journal entry with AI...');
        try {
          const aiInsights = await analyzeEntry(
            updates.content, 
            updates.title ?? existingEntry.title, 
            updates.mediaUrls ?? (existingEntry.mediaUrls || [])
          );
          
          // Include AI insights in the update
          updates.aiInsights = aiInsights;
          
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
      
      const updatedEntry = await storage.updateJournalEntry(id, updates);
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
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Calculate entries this week
      const entriesThisWeek = sortedEntries.filter(entry => 
        new Date(entry.createdAt) >= oneWeekAgo
      ).length;

      // Calculate days since last entry
      const lastEntry = sortedEntries[0];
      const daysSinceLastEntry = Math.floor((now.getTime() - new Date(lastEntry.createdAt).getTime()) / (24 * 60 * 60 * 1000));

      // Calculate day streak (consecutive days with entries starting from today)
      let dayStreak = 0;
      // Use UTC consistently to avoid timezone issues
      const nowUTC = new Date();
      const todayUTC = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate()));

      // Group entries by date (YYYY-MM-DD format using UTC)
      const entriesByDate = new Map<string, number>();
      sortedEntries.forEach(entry => {
        const dateStr = new Date(entry.createdAt).toISOString().split('T')[0];
        entriesByDate.set(dateStr, (entriesByDate.get(dateStr) || 0) + 1);
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
          await storage.updateJournalEntry(entry.id, { aiInsights: newAiInsights });
          
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
          await storage.updateJournalEntry(entry.id, { mediaUrls: newMediaUrls }, userId);
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
      
      // Get entries that have media but no AI insights
      const entriesNeedingAnalysis = await storage.getJournalEntriesByUserId(userId);
      const entriesToAnalyze = entriesNeedingAnalysis.filter((entry: any) => 
        !entry.aiInsights && entry.mediaUrls && entry.mediaUrls.length > 0
      );

      console.log(`📊 Found ${entriesToAnalyze.length} entries that need AI analysis`);

      let analyzed = 0;
      let errors = 0;

      // Analyze entries one by one to avoid rate limits
      for (const entry of entriesToAnalyze) {
        try {
          console.log(`🤖 Analyzing entry: "${entry.title || entry.id.substring(0, 8)}"...`);
          
          const aiInsights = await analyzeEntry(
            entry.content ?? '', 
            entry.title ?? undefined, 
            entry.mediaUrls ?? []
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
      const newSharedWith = [...new Set([...currentSharedWith, ...userIds])];
      
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
