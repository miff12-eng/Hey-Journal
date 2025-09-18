import { Router } from 'express';
import { z } from 'zod';
import { 
  performVectorSearch, 
  performConversationalSearch, 
  performHybridSearch 
} from '../services/vectorSearch';
import EmbeddingProcessor from '../services/embeddingProcessor';

const router = Router();

// Enhanced search endpoint with vector similarity
router.post('/api/search/enhanced', async (req, res) => {
  try {
    const searchSchema = z.object({
      query: z.string().min(1, 'Search query is required'),
      mode: z.enum(['vector', 'conversational', 'hybrid']).default('hybrid'),
      limit: z.number().int().min(1).max(50).default(10),
      threshold: z.number().min(0).max(1).default(0.3)
    });

    const { query, mode, limit, threshold } = searchSchema.parse(req.body);
    const userId = req.userId!;
    
    console.log('🚀 Enhanced search request:', { query, mode, userId });

    let results;
    const startTime = Date.now();

    switch (mode) {
      case 'vector':
        results = await performVectorSearch(query, userId, limit, threshold);
        break;
      
      case 'conversational':
        const previousMessages = req.body.previousMessages || [];
        const conversationalResult = await performConversationalSearch(query, userId, previousMessages);
        return res.json({
          query,
          mode,
          answer: conversationalResult.answer,
          relevantEntries: conversationalResult.relevantEntries,
          confidence: conversationalResult.confidence,
          totalResults: conversationalResult.totalResults,
          executionTime: Date.now() - startTime
        });
      
      case 'hybrid':
      default:
        results = await performHybridSearch(query, userId, limit, 'balanced');
        break;
    }

    console.log(`✅ Enhanced search completed: ${results.length} results in ${Date.now() - startTime}ms`);

    res.json({
      query,
      mode,
      results: results.map(result => ({
        entryId: result.entryId,
        similarity: result.similarity,
        snippet: result.snippet,
        title: result.title,
        matchReason: result.matchReason
      })),
      totalResults: results.length,
      executionTime: Date.now() - startTime
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid search parameters', details: error.errors });
    }
    console.error('Enhanced search error:', error);
    res.status(500).json({ error: 'Enhanced search failed' });
  }
});

// Conversational AI search endpoint
router.post('/api/search/conversation', async (req, res) => {
  try {
    const conversationSchema = z.object({
      query: z.string().min(1, 'Question is required'),
      previousMessages: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string()
      })).default([])
    });

    const { query, previousMessages } = conversationSchema.parse(req.body);
    const userId = req.userId!;
    
    console.log('💬 Conversational search request:', { query, userId, messageCount: previousMessages.length });

    const startTime = Date.now();
    const result = await performConversationalSearch(query, userId, previousMessages);

    console.log(`🎯 Conversational search completed: confidence ${result.confidence.toFixed(2)} in ${Date.now() - startTime}ms`);

    res.json({
      ...result,
      executionTime: Date.now() - startTime
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid conversation parameters', details: error.errors });
    }
    console.error('Conversational search error:', error);
    res.status(500).json({ error: 'Conversational search failed' });
  }
});

// Embedding processing endpoints
router.post('/api/embeddings/process', async (req, res) => {
  try {
    const userId = req.userId!;
    const processor = EmbeddingProcessor.getInstance();
    
    console.log('🔄 Starting embedding processing for user:', userId);
    
    const result = await processor.processMissingEmbeddings(userId, 20);
    
    console.log('📊 Embedding processing completed:', result);

    res.json({
      message: 'Embedding processing completed',
      ...result
    });

  } catch (error) {
    console.error('Embedding processing error:', error);
    res.status(500).json({ error: 'Embedding processing failed' });
  }
});

// Queue entry for embedding processing
router.post('/api/embeddings/queue/:entryId', async (req, res) => {
  try {
    const { entryId } = req.params;
    const processor = EmbeddingProcessor.getInstance();
    
    await processor.queueEntryForProcessing(entryId);
    
    res.json({ message: 'Entry queued for embedding processing', entryId });

  } catch (error) {
    console.error('Embedding queue error:', error);
    res.status(500).json({ error: 'Failed to queue entry for processing' });
  }
});

// Get embedding processing status
router.get('/api/embeddings/status', async (req, res) => {
  try {
    const userId = req.userId!;
    
    // Get stats about embeddings for this user
    const { db } = await import('../db');
    const { journalEntries } = await import('../../shared/schema');
    const { eq, and, isNotNull, isNull, or } = await import('drizzle-orm');

    const [totalEntries, withEmbeddings, needsProcessing] = await Promise.all([
      db.select({ count: db.count() }).from(journalEntries).where(eq(journalEntries.userId, userId)),
      db.select({ count: db.count() }).from(journalEntries).where(
        and(
          eq(journalEntries.userId, userId),
          isNotNull(journalEntries.contentEmbedding),
          isNotNull(journalEntries.lastEmbeddingUpdate)
        )
      ),
      db.select({ count: db.count() }).from(journalEntries).where(
        and(
          eq(journalEntries.userId, userId),
          or(
            isNull(journalEntries.contentEmbedding),
            isNull(journalEntries.lastEmbeddingUpdate)
          )
        )
      )
    ]);

    res.json({
      totalEntries: totalEntries[0].count,
      withEmbeddings: withEmbeddings[0].count,
      needsProcessing: needsProcessing[0].count,
      embeddingCoverage: totalEntries[0].count > 0 
        ? (withEmbeddings[0].count / totalEntries[0].count * 100).toFixed(1) + '%'
        : '0%'
    });

  } catch (error) {
    console.error('Embedding status error:', error);
    res.status(500).json({ error: 'Failed to get embedding status' });
  }
});

export default router;