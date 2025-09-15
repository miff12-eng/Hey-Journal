import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateAIResponse, transcribeAudio, analyzeJournalEntry } from "./ai";
import { insertJournalEntrySchema, insertAiChatSessionSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Development authentication bypass
  app.use('/api', (req, res, next) => {
    // Development bypass - always authenticate as mock user
    req.userId = 'mock-user-id';
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
    try {
      const { message, conversationId } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Get user's recent journal entries for context
      const entries = await storage.getJournalEntriesByUserId(req.userId, 10);
      
      // Get previous conversation if exists
      let previousMessages = [];
      if (conversationId) {
        const session = await storage.getAiChatSession(conversationId);
        if (session) {
          previousMessages = session.messages || [];
        }
      }

      const aiResponse = await generateAIResponse(message, entries, previousMessages);
      
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
      if (error.message && error.message.includes('insufficient_quota')) {
        res.status(429).json({ 
          error: 'OpenAI API quota exceeded. Please check your OpenAI billing and usage limits.',
          type: 'quota_exceeded'
        });
      } else if (error.message && error.message.includes('rate_limit')) {
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
      const entries = await storage.getJournalEntriesByUserId(req.userId, limit);
      res.json(entries);
    } catch (error) {
      console.error('Get Entries Error:', error);
      res.status(500).json({ error: 'Failed to fetch journal entries' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
