import { generateTextEmbedding, calculateCosineSimilarity, parseVectorFromPostgres } from './vectorEmbeddings';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Normalize malformed entry citations in AI answers
 * Converts [entry: "Title"] or [entry:"Title"] to [entry:UUID] format
 */
function normalizeCitations(answer: string, contextEntries: Array<{id: string, title: string}>): string {
  // Pattern to match [entry: "Title"], [entry:"Title"], [entry: Title] variations
  const citationPattern = /\[entry:\s*["']?([^[\]"']+?)["']?\s*\]/g;
  
  return answer.replace(citationPattern, (match, title) => {
    // If it's already a UUID format, standardize it (strip quotes)
    const uuidPattern = /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12}$/;
    const cleanedTitle = title.trim();
    if (uuidPattern.test(cleanedTitle)) {
      console.log(`🔗 Standardized UUID citation: "${title}" -> ${cleanedTitle}`);
      return `[entry:${cleanedTitle}]`; // Strip quotes from UUID format
    }
    
    // Normalize title for comparison (trim whitespace, handle case sensitivity)
    const normalizedTitle = title.trim();
    
    // Find matching entry by exact title match first
    let matchingEntry = contextEntries.find(entry => entry.title === normalizedTitle);
    
    // If no exact match, try case-insensitive matching
    if (!matchingEntry) {
      matchingEntry = contextEntries.find(entry => 
        entry.title.toLowerCase() === normalizedTitle.toLowerCase()
      );
    }
    
    if (matchingEntry) {
      console.log(`🔗 Normalized citation: "${title}" -> ${matchingEntry.id}`);
      return `[entry:${matchingEntry.id}]`;
    } else {
      // If no matching entry found, remove brackets to prevent broken links
      console.log(`⚠️ Could not resolve citation for title: "${title}"`);
      return title; // Return just the title without brackets
    }
  });
}

interface VectorSearchResult {
  entryId: string;
  similarity: number;
  snippet: string;
  title?: string;
  matchReason: string;
}

interface ConversationalSearchResult {
  answer: string;
  relevantEntries: VectorSearchResult[];
  confidence: number;
  totalResults: number;
}

/**
 * Perform vector similarity search on journal entries
 */
export async function performVectorSearch(
  queryText: string,
  userId: string,
  limit: number = 10,
  similarityThreshold: number = 0.3,
  filters?: {
    filterType?: 'tags' | 'date';
    tags?: string[];
    dateRange?: { from?: string; to?: string };
  }
): Promise<VectorSearchResult[]> {
  try {
    console.log('🔍 Performing vector search for:', queryText, filters ? 'with filters' : '');
    
    // Step 1: Generate embedding for the search query
    const queryEmbedding = await generateTextEmbedding(queryText);
    console.log('🔢 Generated query embedding with', queryEmbedding.length, 'dimensions');

    // Step 2: Execute raw SQL for vector similarity search using PostgreSQL
    // Note: Since we're storing as text, we'll need to calculate similarity in memory
    // In a production environment, you'd use pgvector's cosine similarity operators
    const { db } = await import('../db');
    const { journalEntries } = await import('../../shared/schema');
    const { eq, and, isNotNull, gte, lte, arrayContains } = await import('drizzle-orm');

    // Build where conditions
    const whereConditions = [
      eq(journalEntries.userId, userId),
      isNotNull(journalEntries.contentEmbedding)
    ];
    
    console.log('🔍 Built where conditions for userId:', userId);
    console.log('🔍 Where conditions length:', whereConditions.length);

    // Apply filters
    if (filters?.tags && filters.tags.length > 0) {
      // Check if any of the provided tags exist in the entry's tags array
      filters.tags.forEach(tag => {
        whereConditions.push(arrayContains(journalEntries.tags, [tag]));
      });
    }

    if (filters?.dateRange) {
      console.log('🗓️ Date filtering with:', filters.dateRange);
      if (filters.dateRange.from) {
        const fromDate = new Date(filters.dateRange.from);
        console.log('🗓️ FROM date parsed as:', fromDate.toISOString());
        whereConditions.push(gte(journalEntries.createdAt, fromDate));
      }
      if (filters.dateRange.to) {
        // Add 1 day to include the entire "to" date
        const toDate = new Date(filters.dateRange.to);
        toDate.setDate(toDate.getDate() + 1);
        console.log('🗓️ TO date (with +1 day) parsed as:', toDate.toISOString());
        whereConditions.push(lte(journalEntries.createdAt, toDate));
      }
    }

    // Get all entries with embeddings for this user
    console.log('🔍 About to execute database query...');
    const entriesWithEmbeddings = await db
      .select()
      .from(journalEntries)
      .where(and(...whereConditions));

    console.log('📊 Found', entriesWithEmbeddings.length, 'entries with embeddings');
    console.log('📊 Sample entry IDs:', entriesWithEmbeddings.slice(0, 3).map(e => e.id));

    // Step 3: Calculate similarities in memory (for PostgreSQL without pgvector operators)
    const similarities: VectorSearchResult[] = [];

    for (const entry of entriesWithEmbeddings) {
      try {
        if (!entry.contentEmbedding) continue;

        // Parse the stored embedding
        const entryEmbedding = parseVectorFromPostgres(entry.contentEmbedding);
        if (entryEmbedding.length === 0) continue;

        // Calculate cosine similarity
        const similarity = calculateCosineSimilarity(queryEmbedding, entryEmbedding);
        
        if (similarity >= similarityThreshold) {
          // Create snippet from searchable text or content
          const fullText = entry.searchableText || entry.content;
          const snippet = fullText.length > 200 
            ? fullText.substring(0, 200) + '...'
            : fullText;

          similarities.push({
            entryId: entry.id,
            similarity,
            snippet,
            title: entry.title || undefined,
            matchReason: `Vector similarity: ${(similarity * 100).toFixed(1)}%`
          });
        }
      } catch (embeddingError) {
        console.error('❌ Error processing embedding for entry:', entry.id, embeddingError);
        continue;
      }
    }

    // Step 4: Sort by similarity and limit results
    const sortedResults = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    console.log('🎯 Vector search completed:', {
      queryLength: queryText.length,
      totalEntriesSearched: entriesWithEmbeddings.length,
      resultsFound: sortedResults.length,
      topSimilarity: sortedResults[0]?.similarity || 0
    });

    return sortedResults;

  } catch (error) {
    console.error('❌ Vector search error:', error);
    return [];
  }
}

/**
 * Conversational search using RAG (Retrieval-Augmented Generation)
 */
export async function performConversationalSearch(
  query: string,
  userId: string,
  previousMessages: Array<{role: string, content: string}> = [],
  filters?: {
    filterType?: 'tags' | 'date';
    tags?: string[];
    dateRange?: { from?: string; to?: string };
  }
): Promise<ConversationalSearchResult> {
  try {
    console.log('🤖 Starting conversational search for:', query, filters ? 'with filters' : '');

    // Step 1: Perform semantic vector search to get relevant context (semantic-only, no keywords)
    const relevantEntries = await performVectorSearch(query, userId, 8, 0.15, filters);
    
    if (relevantEntries.length === 0) {
      return {
        answer: "I couldn't find any relevant entries in your journal related to that query. Try asking about something else or adding more details to your question.",
        relevantEntries: [],
        confidence: 0.1,
        totalResults: 0
      };
    }

    // Step 2: Get full entry details for context
    const { db } = await import('../db');
    const { journalEntries } = await import('../../shared/schema');
    const { inArray } = await import('drizzle-orm');

    const entryDetails = await db
      .select()
      .from(journalEntries)
      .where(inArray(journalEntries.id, relevantEntries.map(r => r.entryId)));

    // Step 3: Build context for GPT-5
    const contextEntries = entryDetails.map(entry => {
      const relevantEntry = relevantEntries.find(r => r.entryId === entry.id);
      return {
        id: entry.id,
        title: entry.title || 'Untitled',
        content: entry.content,
        date: entry.createdAt?.toDateString() || 'Unknown date',
        tags: entry.tags || [],
        similarity: relevantEntry?.similarity || 0,
        aiInsights: entry.aiInsights
      };
    });

    const contextText = contextEntries.map(entry => 
      `Entry: "${entry.title}" (ID: ${entry.id}, ${entry.date}, Relevance: ${(entry.similarity * 100).toFixed(1)}%)\n` +
      `Content: ${entry.content}\n` +
      `Tags: ${entry.tags.join(', ')}\n` +
      (entry.aiInsights ? `Summary: ${entry.aiInsights.summary}\n` : '') +
      '---'
    ).join('\n\n');

    // Step 4: Generate conversational response using GPT-5
    const messages = [
      {
        role: "system",
        content: `You are an AI assistant that analyzes and summarizes a user's personal journal entries. Your role is strictly to reflect back what is written in the provided journal entries - never give advice, suggestions, or recommendations.

Guidelines:
- Only summarize and reference what is explicitly written in the journal entries
- Stay factual and descriptive - report what the user wrote, not what they should do
- If the question cannot be answered from the journal entries, simply state what information is or isn't present
- Never give advice, suggestions, or recommendations about what the user should do
- Never reference anything outside of the provided journal entries

**CITATION FORMAT - CRITICAL:**
When referencing a specific entry, you MUST use the exact ID format: [entry:ENTRY_ID]

✅ CORRECT Examples:
- "In your entry from September 18th [entry:2d130f98-bd8e-4e1a-a814-e9c352b8517d], you wrote about..."
- "As mentioned in [entry:6d558107-d49d-4015-ab82-3fdd360dd63a], you felt..."

❌ WRONG Examples (DO NOT USE):
- [entry:"Maggie's first complete sentence"] ← Never use titles
- [entry:Title] ← Never use titles
- [entry: "Any text here"] ← Never use quoted text

**BEFORE FINALIZING:** Check that every [entry:...] contains only the UUID from the provided entries, not titles or descriptions.

Relevant journal entries:
${contextText}`
      },
      ...previousMessages.slice(-3), // Include last 3 messages for conversation context
      {
        role: "user",
        content: query
      }
    ];

    console.log('🔥 Sending RAG request to GPT-4o with', contextEntries.length, 'entries as context');

    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Using GPT-4o for conversational AI responses
      messages: messages as any,
      max_completion_tokens: 500
    });

    let answer = completion.choices[0]?.message?.content || 
      "I couldn't generate a response based on your journal entries.";

    // Step 5: Normalize malformed entry citations
    console.log('🔧 Normalizing entry citations in AI answer');
    answer = normalizeCitations(answer, contextEntries);

    // Step 6: Calculate confidence based on relevance and context quality
    const avgSimilarity = relevantEntries.reduce((sum, entry) => sum + entry.similarity, 0) / relevantEntries.length;
    const confidence = Math.min(0.95, avgSimilarity * 1.2); // Cap at 95% confidence

    console.log('✅ Conversational search completed:', {
      entriesUsed: contextEntries.length,
      avgSimilarity: avgSimilarity.toFixed(3),
      confidence: confidence.toFixed(3),
      answerLength: answer.length
    });

    return {
      answer,
      relevantEntries,
      confidence,
      totalResults: relevantEntries.length
    };

  } catch (error) {
    console.error('❌ Conversational search error:', error);
    return {
      answer: "I encountered an error while searching your journal. Please try again with a different query.",
      relevantEntries: [],
      confidence: 0,
      totalResults: 0
    };
  }
}

/**
 * Hybrid search combining vector similarity with keyword matching
 */
export async function performHybridSearch(
  query: string,
  userId: string,
  limit: number = 10,
  mode: 'balanced' | 'semantic' | 'keyword' = 'balanced',
  filters?: {
    filterType?: 'tags' | 'date';
    tags?: string[];
    dateRange?: { from?: string; to?: string };
  }
): Promise<VectorSearchResult[]> {
  try {
    console.log('🔀 Performing hybrid search:', { query, mode, limit, filters });

    // Get both vector and keyword results
    const [vectorResults, keywordResults] = await Promise.all([
      performVectorSearch(query, userId, limit * 2, 0.15, filters), // Lower threshold for more results
      performKeywordSearch(query, userId, limit * 2, filters) // Helper function for keyword search
    ]);

    // Combine and weight results based on mode
    const combinedResults = new Map<string, VectorSearchResult>();

    // Process vector results
    vectorResults.forEach(result => {
      const weight = mode === 'keyword' ? 0.3 : (mode === 'semantic' ? 1.0 : 0.7);
      combinedResults.set(result.entryId, {
        ...result,
        similarity: result.similarity * weight,
        matchReason: `Vector: ${result.matchReason}`
      });
    });

    // Process keyword results and combine
    keywordResults.forEach(result => {
      const weight = mode === 'semantic' ? 0.3 : (mode === 'keyword' ? 1.0 : 0.7);
      const existing = combinedResults.get(result.entryId);
      
      if (existing) {
        // Boost entries that match both vector and keyword
        combinedResults.set(result.entryId, {
          ...existing,
          similarity: existing.similarity + (result.similarity * weight * 0.5),
          matchReason: `${existing.matchReason} + Keyword: ${result.matchReason}`
        });
      } else {
        combinedResults.set(result.entryId, {
          ...result,
          similarity: result.similarity * weight,
          matchReason: `Keyword: ${result.matchReason}`
        });
      }
    });

    // Sort and return top results
    const finalResults = Array.from(combinedResults.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    console.log('🎯 Hybrid search completed:', {
      vectorResults: vectorResults.length,
      keywordResults: keywordResults.length,
      combinedResults: finalResults.length,
      mode
    });

    return finalResults;

  } catch (error) {
    console.error('❌ Hybrid search error:', error);
    return [];
  }
}

/**
 * Simple keyword search helper (fallback implementation)
 */
async function performKeywordSearch(
  query: string, 
  userId: string, 
  limit: number,
  filters?: {
    filterType?: 'tags' | 'date';
    tags?: string[];
    dateRange?: { from?: string; to?: string };
  }
): Promise<VectorSearchResult[]> {
  try {
    const { db } = await import('../db');
    const { journalEntries } = await import('../../shared/schema');
    const { eq, and, or, ilike, gte, lte, arrayContains } = await import('drizzle-orm');

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(word => word.length > 0);

    // Build where conditions
    const whereConditions = [
      eq(journalEntries.userId, userId),
      or(
        ilike(journalEntries.title, `%${query}%`),
        ilike(journalEntries.content, `%${query}%`),
        ilike(journalEntries.searchableText, `%${query}%`)
      )
    ];

    // Apply filters
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach(tag => {
        whereConditions.push(arrayContains(journalEntries.tags, [tag]));
      });
    }

    if (filters?.dateRange) {
      if (filters.dateRange.from) {
        whereConditions.push(gte(journalEntries.createdAt, new Date(filters.dateRange.from)));
      }
      if (filters.dateRange.to) {
        const toDate = new Date(filters.dateRange.to);
        toDate.setDate(toDate.getDate() + 1);
        whereConditions.push(lte(journalEntries.createdAt, toDate));
      }
    }

    const entries = await db
      .select()
      .from(journalEntries)
      .where(and(...whereConditions))
      .limit(limit);

    return entries.map(entry => {
      // Simple scoring based on keyword matches
      let score = 0;
      const content = (entry.content + ' ' + (entry.title || '')).toLowerCase();
      
      if (content.includes(queryLower)) score += 0.8;
      queryWords.forEach(word => {
        if (content.includes(word)) score += 0.3;
      });

      const snippet = entry.content.length > 200 
        ? entry.content.substring(0, 200) + '...'
        : entry.content;

      return {
        entryId: entry.id,
        similarity: Math.min(score, 1.0),
        snippet,
        title: entry.title || undefined,
        matchReason: `Keyword matches`
      };
    });

  } catch (error) {
    console.error('❌ Keyword search error:', error);
    return [];
  }
}

export {
  VectorSearchResult,
  ConversationalSearchResult
};