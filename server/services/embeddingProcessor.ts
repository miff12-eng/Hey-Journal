import { enhancedAnalyzeEntry } from './enhancedOpenAI';
import { AiInsights } from '@shared/schema';

/**
 * Background service to process and generate embeddings for journal entries
 */
export class EmbeddingProcessor {
  private static instance: EmbeddingProcessor;
  private processingQueue: string[] = [];
  private isProcessing = false;

  static getInstance(): EmbeddingProcessor {
    if (!EmbeddingProcessor.instance) {
      EmbeddingProcessor.instance = new EmbeddingProcessor();
    }
    return EmbeddingProcessor.instance;
  }

  /**
   * Queue an entry for embedding processing
   */
  async queueEntryForProcessing(entryId: string): Promise<void> {
    if (!this.processingQueue.includes(entryId)) {
      this.processingQueue.push(entryId);
      console.log('📋 Queued entry for embedding processing:', entryId);
    }

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process the queue of entries needing embeddings
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log('🔄 Starting embedding processing queue, items:', this.processingQueue.length);

    while (this.processingQueue.length > 0) {
      const entryId = this.processingQueue.shift();
      if (!entryId) continue;

      try {
        await this.processEntry(entryId);
        console.log('✅ Processed embedding for entry:', entryId);
      } catch (error) {
        console.error('❌ Failed to process embedding for entry:', entryId, error);
        // Continue processing other entries even if one fails
      }

      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessing = false;
    console.log('🏁 Embedding processing queue completed');
  }

  /**
   * Process a single entry to generate embeddings and enhanced insights
   */
  private async processEntry(entryId: string): Promise<void> {
    try {
      console.log('🔄 Processing entry for embeddings:', entryId);

      // Get entry details
      const { db } = await import('../db');
      const { journalEntries } = await import('../../shared/schema');
      const { eq } = await import('drizzle-orm');

      const [entry] = await db
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.id, entryId))
        .limit(1);

      if (!entry) {
        throw new Error(`Entry not found: ${entryId}`);
      }

      // Check if entry already has recent embeddings
      if (entry.lastEmbeddingUpdate && entry.contentEmbedding) {
        const hoursSinceUpdate = (Date.now() - entry.lastEmbeddingUpdate.getTime()) / (1000 * 60 * 60);
        if (hoursSinceUpdate < 1) {
          console.log('⏩ Skipping recently processed entry:', entryId);
          return;
        }
      }

      // Generate enhanced analysis with embeddings
      const enhanced = await enhancedAnalyzeEntry(
        entry.content,
        entry.title,
        entry.mediaUrls || [],
        entry.audioUrl,
        entry.tags || []
      );

      // Update entry with new insights and embeddings
      await db
        .update(journalEntries)
        .set({
          aiInsights: enhanced as AiInsights,
          contentEmbedding: enhanced.embeddingString,
          searchableText: enhanced.searchableText,
          embeddingVersion: 'v1',
          lastEmbeddingUpdate: new Date(),
          updatedAt: new Date()
        })
        .where(eq(journalEntries.id, entryId));

      console.log('🎯 Enhanced entry with embeddings:', {
        entryId,
        keywordCount: enhanced.keywords?.length || 0,
        embeddingDimensions: enhanced.embedding?.length || 0,
        hasSearchableText: !!enhanced.searchableText
      });

    } catch (error) {
      console.error('❌ Error processing entry embeddings:', error);
      throw error;
    }
  }

  /**
   * Batch process entries that don't have embeddings yet
   */
  async processMissingEmbeddings(userId?: string, limit: number = 10): Promise<{
    processed: number;
    errors: number;
    totalFound: number;
  }> {
    try {
      console.log('🔍 Finding entries missing embeddings...');

      const { db } = await import('../db');
      const { journalEntries } = await import('../../shared/schema');
      const { eq, and, isNull, or } = await import('drizzle-orm');

      // Build conditions
      const conditions = [
        or(
          isNull(journalEntries.contentEmbedding),
          isNull(journalEntries.lastEmbeddingUpdate)
        )
      ];

      if (userId) {
        conditions.push(eq(journalEntries.userId, userId));
      }

      const entriesNeedingEmbeddings = await db
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(...conditions))
        .limit(limit);

      console.log('📊 Found', entriesNeedingEmbeddings.length, 'entries needing embeddings');

      if (entriesNeedingEmbeddings.length === 0) {
        return { processed: 0, errors: 0, totalFound: 0 };
      }

      // Process entries
      let processed = 0;
      let errors = 0;

      for (const entry of entriesNeedingEmbeddings) {
        try {
          await this.processEntry(entry.id);
          processed++;
        } catch (error) {
          console.error('❌ Failed to process entry:', entry.id, error);
          errors++;
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      console.log('📈 Batch embedding processing completed:', {
        totalFound: entriesNeedingEmbeddings.length,
        processed,
        errors
      });

      return {
        processed,
        errors,
        totalFound: entriesNeedingEmbeddings.length
      };

    } catch (error) {
      console.error('❌ Error in batch embedding processing:', error);
      return { processed: 0, errors: 1, totalFound: 0 };
    }
  }

  /**
   * Process all historical entries for a user with detailed reporting
   */
  async processAllHistoricalEntries(userId: string): Promise<{
    totalEntries: number;
    processedEntries: number;
    skippedEntries: number;
    errorEntries: number;
    executionTime: number;
  }> {
    const startTime = Date.now();
    
    try {
      console.log('🔄 Processing all historical entries for user:', userId);

      const { db } = await import('../db');
      const { journalEntries } = await import('../../shared/schema');
      const { eq, isNull, or } = await import('drizzle-orm');

      // Get all entries for this user using storage interface
      const { storage } = await import('../storage');
      const allEntries = await storage.getJournalEntriesByUserId(userId, 1000); // Get up to 1000 entries
      
      const entriesNeedingEmbeddings = allEntries.map(entry => ({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        audioUrl: entry.audioUrl,
        mediaUrls: entry.mediaUrls
      }));

      console.log('📊 Found', entriesNeedingEmbeddings.length, 'total entries for user');

      let processedEntries = 0;
      let skippedEntries = 0;
      let errorEntries = 0;

      // Process each entry individually for better error handling and reporting
      for (const entry of entriesNeedingEmbeddings) {
        try {
          // Check if entry already has embeddings
          const existingEntry = await db
            .select({
              contentEmbedding: journalEntries.contentEmbedding,
              lastEmbeddingUpdate: journalEntries.lastEmbeddingUpdate
            })
            .from(journalEntries)
            .where(eq(journalEntries.id, entry.id))
            .limit(1);

          if (existingEntry[0]?.contentEmbedding && existingEntry[0]?.lastEmbeddingUpdate) {
            console.log('⏭️ Skipping entry with existing embeddings:', entry.id);
            skippedEntries++;
            continue;
          }

          console.log('🔄 Processing entry:', entry.id, '-', entry.title);
          await this.processEntry(entry.id);
          processedEntries++;
          console.log('✅ Successfully processed entry:', entry.id);

        } catch (error) {
          console.error('❌ Failed to process entry:', entry.id, error);
          errorEntries++;
        }

        // Rate limiting to avoid overwhelming the OpenAI API
        await new Promise(resolve => setTimeout(resolve, 250));
      }

      const executionTime = Date.now() - startTime;

      console.log('🏁 Historical entry processing completed:', {
        totalEntries: entriesNeedingEmbeddings.length,
        processedEntries,
        skippedEntries,
        errorEntries,
        executionTimeMs: executionTime
      });

      return {
        totalEntries: entriesNeedingEmbeddings.length,
        processedEntries,
        skippedEntries,
        errorEntries,
        executionTime
      };

    } catch (error) {
      console.error('❌ Error in processAllHistoricalEntries:', error);
      const executionTime = Date.now() - startTime;
      return {
        totalEntries: 0,
        processedEntries: 0,
        skippedEntries: 0,
        errorEntries: 1,
        executionTime
      };
    }
  }

  /**
   * Re-process all embeddings (useful when upgrading embedding model)
   */
  async reprocessAllEmbeddings(userId?: string): Promise<void> {
    try {
      console.log('🔄 Starting full embedding reprocessing...');

      const { db } = await import('../db');
      const { journalEntries } = await import('../../shared/schema');
      const { eq } = await import('drizzle-orm');

      const conditions = userId ? [eq(journalEntries.userId, userId)] : [];

      const allEntries = await db
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(conditions.length > 0 ? conditions[0] : undefined);

      console.log('📊 Found', allEntries.length, 'total entries to reprocess');

      // Queue all entries for processing
      for (const entry of allEntries) {
        await this.queueEntryForProcessing(entry.id);
      }

    } catch (error) {
      console.error('❌ Error starting full reprocessing:', error);
    }
  }
}

export default EmbeddingProcessor;