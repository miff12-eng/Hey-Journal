import { generateTextEmbedding, calculateCosineSimilarity, parseVectorFromPostgres } from './vectorEmbeddings';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  similarityThreshold: number = 0.3
): Promise<VectorSearchResult[]> {
  try {
    console.log('🔍 Performing vector search for:', queryText);
    
    // Step 1: Generate embedding for the search query
    const queryEmbedding = await generateTextEmbedding(queryText);
    console.log('🔢 Generated query embedding with', queryEmbedding.length, 'dimensions');

    // Step 2: Execute raw SQL for vector similarity search using PostgreSQL
    // Note: Since we're storing as text, we'll need to calculate similarity in memory
    // In a production environment, you'd use pgvector's cosine similarity operators
    const { db } = await import('../db');
    const { journalEntries } = await import('../../shared/schema');
    const { eq, and, isNotNull } = await import('drizzle-orm');

    // Get all entries with embeddings for this user
    const entriesWithEmbeddings = await db
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.userId, userId),
          isNotNull(journalEntries.contentEmbedding)
        )
      );

    console.log('📊 Found', entriesWithEmbeddings.length, 'entries with embeddings');

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
  previousMessages: Array<{role: string, content: string}> = []
): Promise<ConversationalSearchResult> {
  try {
    console.log('🤖 Starting conversational search for:', query);

    // Step 1: Perform semantic vector search to get relevant context (semantic-only, no keywords)
    const relevantEntries = await performVectorSearch(query, userId, 8, 0.15);
    
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
      `Entry: "${entry.title}" (${entry.date}, Relevance: ${(entry.similarity * 100).toFixed(1)}%)\n` +
      `Content: ${entry.content}\n` +
      `Tags: ${entry.tags.join(', ')}\n` +
      (entry.aiInsights ? `Summary: ${entry.aiInsights.summary}\n` : '') +
      '---'
    ).join('\n\n');

    // Step 4: Generate conversational response using GPT-5
    const messages = [
      {
        role: "system",
        content: `You are an AI assistant helping a user explore and understand their personal journal entries through semantic understanding. Based on the most semantically relevant journal entries provided (found through vector similarity, not keyword matching), answer their questions in a thoughtful, insightful, and personal way.

Guidelines:
- Focus on semantic meaning and conceptual relationships rather than exact word matches
- Reference specific entries and dates when relevant
- Identify patterns, themes, and emotional connections across entries
- Provide insights while being empathetic and supportive
- If the context doesn't fully answer the question, acknowledge what you can determine and suggest related aspects
- Use a warm, conversational tone as if you're a thoughtful friend who knows their journal well

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

    const answer = completion.choices[0]?.message?.content || 
      "I couldn't generate a response based on your journal entries.";

    // Step 5: Calculate confidence based on relevance and context quality
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
  mode: 'balanced' | 'semantic' | 'keyword' = 'balanced'
): Promise<VectorSearchResult[]> {
  try {
    console.log('🔀 Performing hybrid search:', { query, mode, limit });

    // Get both vector and keyword results
    const [vectorResults, keywordResults] = await Promise.all([
      performVectorSearch(query, userId, limit * 2, 0.15), // Lower threshold for more results
      performKeywordSearch(query, userId, limit * 2) // Helper function for keyword search
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
async function performKeywordSearch(query: string, userId: string, limit: number): Promise<VectorSearchResult[]> {
  try {
    const { db } = await import('../db');
    const { journalEntries } = await import('../../shared/schema');
    const { eq, and, or, ilike } = await import('drizzle-orm');

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(word => word.length > 0);

    const entries = await db
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.userId, userId),
          or(
            ilike(journalEntries.title, `%${query}%`),
            ilike(journalEntries.content, `%${query}%`),
            ilike(journalEntries.searchableText, `%${query}%`)
          )
        )
      )
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