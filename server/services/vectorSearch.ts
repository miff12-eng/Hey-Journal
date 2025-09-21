import { generateTextEmbedding, calculateCosineSimilarity, parseVectorFromPostgres } from './vectorEmbeddings';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Detect if a search query is asking about recent/temporal information
 */
function detectTemporalQuery(query: string): boolean {
  const temporalKeywords = [
    'recent', 'recently', 'latest', 'newest', 'new', 'last', 'yesterday', 'today',
    'this week', 'this month', 'past week', 'past month', 'current', 'now',
    'most recent', 'most latest', 'most new', 'most current', 'fresh', 'just',
    'what\'s new', 'what is new', 'whats new', 'what have i', 'what did i',
    'update', 'updates', 'progress', 'lately', 'currently'
  ];
  
  const normalizedQuery = query.toLowerCase().trim();
  
  // Check for exact matches or phrases
  for (const keyword of temporalKeywords) {
    if (normalizedQuery.includes(keyword)) {
      return true;
    }
  }
  
  // Check for patterns like "in the last X days/weeks/months"
  const timePatterns = [
    /in the (last|past) \d+ (day|week|month|year)s?/i,
    /from (last|this) (week|month|year)/i,
    /since (yesterday|last)/i,
    /(today|yesterday|this week|this month)/i,
    /what.*?(happened|wrote|did).*?(today|yesterday|recently|lately)/i
  ];
  
  for (const pattern of timePatterns) {
    if (pattern.test(normalizedQuery)) {
      return true;
    }
  }
  
  return false;
}

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
  createdAt?: Date | string;
}

interface ConversationalSearchResult {
  answer: string;
  relevantEntries: VectorSearchResult[];
  confidence: number;
  totalResults: number;
}

/**
 * Get recent entries for temporal queries (prioritizes recency over similarity)
 */
async function getRecentEntries(
  userId: string, 
  limit: number = 5, 
  filters?: {
    filterType?: 'tags' | 'people' | 'date';
    tags?: string[];
    people?: string[];
    dateRange?: { from?: string; to?: string };
    type?: 'feed' | 'shared';
  }
): Promise<VectorSearchResult[]> {
  try {
    const { db } = await import('../db');
    const { journalEntries } = await import('../../shared/schema');
    const { eq, and, desc, gte, lte, arrayContains } = await import('drizzle-orm');

    // Build where conditions 
    let whereConditions = [eq(journalEntries.userId, userId)];

    // Apply date filtering if specified
    if (filters?.dateRange) {
      if (filters.dateRange.from) {
        const fromDate = new Date(filters.dateRange.from);
        whereConditions.push(gte(journalEntries.createdAt, fromDate));
      }
      if (filters.dateRange.to) {
        const toDate = new Date(filters.dateRange.to);
        toDate.setDate(toDate.getDate() + 1);
        whereConditions.push(lte(journalEntries.createdAt, toDate));
      }
    } else {
      // Default: last 30 days for temporal queries
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      whereConditions.push(gte(journalEntries.createdAt, thirtyDaysAgo));
    }

    // Apply tag filtering if specified
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach(tag => {
        whereConditions.push(arrayContains(journalEntries.tags, [tag]));
      });
    }

    const recentEntries = await db
      .select({
        id: journalEntries.id,
        title: journalEntries.title,
        content: journalEntries.content,
        createdAt: journalEntries.createdAt
      })
      .from(journalEntries)
      .where(and(...whereConditions))
      .orderBy(desc(journalEntries.createdAt))
      .limit(limit);

    // Convert to VectorSearchResult format
    return recentEntries.map(entry => ({
      entryId: entry.id,
      similarity: 0.8, // High similarity for recent entries in temporal queries
      snippet: `Title: ${entry.title || 'Untitled'}\n\n${entry.content?.substring(0, 200) || ''}${entry.content && entry.content.length > 200 ? '...' : ''}`,
      title: entry.title || 'Untitled',
      matchReason: `Recent: Created ${entry.createdAt?.toDateString() || 'recently'}`,
      createdAt: entry.createdAt || undefined
    }));

  } catch (error) {
    console.error('❌ Error fetching recent entries:', error);
    return [];
  }
}

/**
 * Apply Feed-specific ranking based on recency, engagement, and relevance
 */
async function applyFeedRanking(results: VectorSearchResult[], userId: string): Promise<VectorSearchResult[]> {
  try {
    // Quick fallback for empty results to avoid database errors
    if (results.length === 0) {
      return results;
    }

    const { db } = await import('../db');
    const { journalEntries, likes, comments } = await import('../../shared/schema');
    const { eq, and, count, desc, inArray, gte } = await import('drizzle-orm');

    // Get entry details with engagement metrics
    const entryIds = results.map(r => r.entryId);
    
    // Use separate queries to avoid overcounting due to join multiplication
    const entriesWithBasicInfo = await db
      .select({
        id: journalEntries.id,
        createdAt: journalEntries.createdAt
      })
      .from(journalEntries)
      .where(inArray(journalEntries.id, entryIds));

    // Get likes count separately
    const likesCountQuery = await db
      .select({
        entryId: likes.entryId,
        likesCount: count(likes.id)
      })
      .from(likes)
      .where(inArray(likes.entryId, entryIds))
      .groupBy(likes.entryId);

    // Get comments count separately  
    const commentsCountQuery = await db
      .select({
        entryId: comments.entryId,
        commentsCount: count(comments.id)
      })
      .from(comments)
      .where(inArray(comments.entryId, entryIds))
      .groupBy(comments.entryId);

    // Combine the results
    const likesMap = new Map(likesCountQuery.map(l => [l.entryId, l.likesCount]));
    const commentsMap = new Map(commentsCountQuery.map(c => [c.entryId, c.commentsCount]));
    
    const entriesWithEngagement = entriesWithBasicInfo.map(entry => ({
      id: entry.id,
      createdAt: entry.createdAt,
      likesCount: likesMap.get(entry.id) || 0,
      commentsCount: commentsMap.get(entry.id) || 0
    }));

    // Get user's recent interactions for context weighting
    const recentLikes = await db
      .select({ entryId: likes.entryId })
      .from(likes)
      .where(and(
        eq(likes.userId, userId),
        inArray(likes.entryId, entryIds),
        gte(likes.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last 7 days
      ));

    const recentComments = await db
      .select({ entryId: comments.entryId })
      .from(comments)
      .where(and(
        eq(comments.userId, userId),
        inArray(comments.entryId, entryIds),
        gte(comments.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last 7 days
      ));

    const userInteractionMap = new Set([
      ...recentLikes.map(l => l.entryId),
      ...recentComments.map(c => c.entryId)
    ]);

    const engagementMap = new Map(
      entriesWithEngagement.map(entry => [entry.id, {
        createdAt: entry.createdAt,
        likesCount: entry.likesCount,
        commentsCount: entry.commentsCount,
        userInteracted: userInteractionMap.has(entry.id)
      }])
    );

    // Apply ranking formula: similarity * recency_factor * engagement_factor
    const rankedResults = results.map(result => {
      const engagement = engagementMap.get(result.entryId);
      const daysSinceCreation = engagement && engagement.createdAt
        ? Math.max(1, (Date.now() - new Date(engagement.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : 30; // Default to 30 days if no data
      
      // Recency factor: newer entries get higher scores (decays over time)
      const recencyFactor = Math.max(0.1, 1 / (1 + daysSinceCreation * 0.1));
      
      // Engagement factor: more likes/comments = higher score
      const engagementScore = engagement 
        ? Math.min(2.0, 1 + (engagement.likesCount * 0.1) + (engagement.commentsCount * 0.2))
        : 1.0;
      
      // User context factor: boost entries user has recently interacted with
      const userContextFactor = engagement?.userInteracted ? 1.3 : 1.0;
      
      // Combined ranking score
      const rankingScore = result.similarity * recencyFactor * engagementScore * userContextFactor;
      
      return {
        ...result,
        similarity: rankingScore,
        matchReason: `${result.matchReason} (ranked: ${rankingScore.toFixed(3)})`
      };
    });

    console.log('📊 Applied Feed ranking to', rankedResults.length, 'results');
    return rankedResults;

  } catch (error) {
    console.error('❌ Feed ranking error:', error);
    return results; // Fallback to original results
  }
}

/**
 * Apply clustering to avoid showing multiple similar entries from the same timeframe
 */
function applyClustering(results: VectorSearchResult[]): VectorSearchResult[] {
  if (results.length <= 3) return results; // Skip clustering for small result sets

  const clustered: VectorSearchResult[] = [];
  const used = new Set<string>();
  
  // Sort by similarity first to prioritize best matches
  const sorted = [...results].sort((a, b) => b.similarity - a.similarity);
  
  for (const result of sorted) {
    if (used.has(result.entryId)) continue;
    
    // Add this result
    clustered.push(result);
    used.add(result.entryId);
    
    // Get creation time for timeframe clustering
    const resultTime = result.createdAt ? new Date(result.createdAt).getTime() : 0;
    
    // Remove entries from same timeframe (within 72 hours) with similar titles or high similarity
    for (const other of sorted) {
      if (used.has(other.entryId) || other.entryId === result.entryId) continue;
      
      const otherTime = other.createdAt ? new Date(other.createdAt).getTime() : 0;
      const timeDifferenceHours = Math.abs(resultTime - otherTime) / (1000 * 60 * 60);
      
      // Check if entries are within 72-hour timeframe
      if (timeDifferenceHours <= 72) {
        let shouldCluster = false;
        
        // Title similarity check (if both have titles)
        if (result.title && other.title) {
          const titleWords = result.title.toLowerCase().split(/\s+/);
          const significantWords = titleWords.filter(word => word.length > 3);
          const otherWords = other.title.toLowerCase().split(/\s+/);
          const commonWords = significantWords.filter(word => otherWords.includes(word));
          
          // If >40% of significant words overlap within timeframe, cluster
          if (significantWords.length > 0 && commonWords.length / significantWords.length > 0.4) {
            shouldCluster = true;
          }
        }
        
        // High similarity check (even without title overlap)
        if (other.similarity && result.similarity && other.similarity > result.similarity * 0.85) {
          shouldCluster = true;
        }
        
        if (shouldCluster) {
          used.add(other.entryId);
        }
      }
    }
    
    // Stop if we have enough diverse results
    if (clustered.length >= Math.min(results.length, 10)) break;
  }
  
  console.log('🔗 Applied timeframe clustering:', results.length, '→', clustered.length, 'results');
  return clustered;
}

/**
 * Perform vector similarity search on journal entries
 */
export async function performVectorSearch(
  queryText: string,
  userId: string,
  limit: number = 10,
  similarityThreshold: number = 0.2,
  filters?: {
    filterType?: 'tags' | 'people' | 'date';
    tags?: string[];
    people?: string[];
    dateRange?: { from?: string; to?: string };
    type?: 'feed' | 'shared';
  },
  source?: 'feed' | 'search'
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

    // Build where conditions based on source type
    let whereConditions = [isNotNull(journalEntries.contentEmbedding)];

    if (source === 'feed') {
      // Feed searches: show public entries OR entries shared with current user OR own entries
      const { or } = await import('drizzle-orm');
      
      if (filters?.type === 'shared') {
        // Shared view: only entries specifically shared with current user
        const sharedCondition = and(
          eq(journalEntries.privacy, 'shared'),
          arrayContains(journalEntries.sharedWith, [userId])
        );
        if (sharedCondition) {
          whereConditions.push(sharedCondition);
        }
      } else {
        // Feed view: public entries + entries shared with user + own entries
        const feedCondition = or(
          eq(journalEntries.privacy, 'public'),
          and(
            eq(journalEntries.privacy, 'shared'),
            arrayContains(journalEntries.sharedWith, [userId])
          ),
          eq(journalEntries.userId, userId) // Include user's own entries
        );
        if (feedCondition) {
          whereConditions.push(feedCondition);
        }
      }
    } else {
      // Regular search: only user's own entries
      whereConditions.push(eq(journalEntries.userId, userId));
    }

    // Apply filters
    if (filters?.tags && filters.tags.length > 0) {
      // Check if any of the provided tags exist in the entry's tags array
      filters.tags.forEach(tag => {
        whereConditions.push(arrayContains(journalEntries.tags, [tag]));
      });
    }

    if (filters?.people && filters.people.length > 0) {
      // Filter entries tagged with specific people by name
      console.log('👥 People filtering with:', filters.people);
      console.log('👥 Starting new People filter logic...');
      const { entryPersonTags, people } = await import('../../shared/schema');
      const { inArray, exists, sql } = await import('drizzle-orm');
      
      // Use EXISTS subquery to find entries tagged with people whose names match the filter
      const peopleSubquery = db
        .select({ entryId: entryPersonTags.entryId })
        .from(entryPersonTags)
        .innerJoin(people, eq(people.id, entryPersonTags.personId))
        .where(
          and(
            eq(people.userId, userId), // Only this user's people
            inArray(people.firstName, filters.people) // Match by first name for now
          )
        );
      
      // Use IN clause instead of EXISTS for better compatibility
      const validEntryIds = await peopleSubquery;
      const entryIdArray = validEntryIds.map(row => row.entryId);
      
      if (entryIdArray.length > 0) {
        console.log('👥 Found entries with people tags:', entryIdArray.length);
        whereConditions.push(inArray(journalEntries.id, entryIdArray));
      } else {
        console.log('👥 No entries found with selected people tags, forcing empty result');
        // Force empty result if no entries have the selected people
        whereConditions.push(sql`FALSE`);
      }
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
    console.log('🔍 Vector search WHERE conditions count:', whereConditions.length);
    console.log('🔍 About to query database with filters...');
    
    const entriesWithEmbeddings = await db
      .select()
      .from(journalEntries)
      .where(and(...whereConditions));
      
    console.log('🔍 Query returned', entriesWithEmbeddings.length, 'entries');
    console.log('🔍 Entries have embeddings:', entriesWithEmbeddings.map(e => ({ id: e.id, title: e.title, hasEmbedding: !!e.contentEmbedding })));

    // Step 3: Calculate similarities in memory (for PostgreSQL without pgvector operators)
    const similarities: VectorSearchResult[] = [];

    console.log('🎯 Starting similarity calculation for', entriesWithEmbeddings.length, 'entries');
    console.log('🎯 Query text:', queryText.trim(), 'Filters:', filters);

    for (const entry of entriesWithEmbeddings) {
      console.log('🔍 Processing entry:', entry.id, 'title:', entry.title, 'hasEmbedding:', !!entry.contentEmbedding);
      try {
        if (!entry.contentEmbedding) continue;

        // Parse the stored embedding
        const entryEmbedding = parseVectorFromPostgres(entry.contentEmbedding);
        if (entryEmbedding.length === 0) continue;

        // Calculate cosine similarity
        const similarity = calculateCosineSimilarity(queryEmbedding, entryEmbedding);
        
        // Check if we have active filters (people, tags, dateRange)
        const hasActiveFilters = (filters?.people && filters.people.length > 0) ||
                                (filters?.tags && filters.tags.length > 0) ||
                                (filters?.dateRange);
        
        // For wildcard queries with filters, bypass similarity threshold since user wants all filtered results
        const isWildcardWithFilters = queryText.trim() === '*' && hasActiveFilters;
        const passesThreshold = isWildcardWithFilters || similarity >= similarityThreshold;
        
        console.log('🔍 Entry similarity check:', {
          entryId: entry.id,
          entryTitle: entry.title,
          similarity: similarity.toFixed(4),
          threshold: similarityThreshold,
          hasActiveFilters,
          isWildcardWithFilters,
          passesThreshold,
          queryText: queryText.trim()
        });
        
        if (passesThreshold) {
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
            matchReason: `Vector similarity: ${(similarity * 100).toFixed(1)}%`,
            createdAt: entry.createdAt || undefined
          });
        }
      } catch (embeddingError) {
        console.error('❌ Error processing embedding for entry:', entry.id, embeddingError);
        continue;
      }
    }

    // Step 4: Apply Feed-specific ranking and clustering
    let processedResults = similarities;
    
    if (source === 'feed') {
      // Apply result ranking based on recency, engagement, and relevance
      processedResults = await applyFeedRanking(similarities, userId);
      
      // Apply clustering to avoid multiple similar entries
      processedResults = applyClustering(processedResults);
    }
    
    // Sort by similarity and limit results
    const sortedResults = processedResults
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
    filterType?: 'tags' | 'people' | 'date';
    tags?: string[];
    people?: string[];
    dateRange?: { from?: string; to?: string };
    type?: 'feed' | 'shared';
  },
  source?: 'feed' | 'search'
): Promise<ConversationalSearchResult> {
  try {
    console.log('🤖 Starting conversational search for:', query, filters ? 'with filters' : '');

    // Only apply temporal query detection for Feed page, not Search page
    // Search page should be purely semantic to find relevant historical content
    const isTemporalQuery = source === 'feed' && detectTemporalQuery(query);
    console.log('⏰ Temporal query detected for Feed:', isTemporalQuery);

    let relevantEntries: VectorSearchResult[] = [];

    if (isTemporalQuery) {
      // Step 1a: For temporal queries on Feed page, combine recent entries with semantic search
      console.log('🕐 Using temporal search strategy for Feed...');
      
      // Get recent entries (last 30 days, sorted by date)
      const recentEntries = await getRecentEntries(userId, 5, filters);
      console.log('📅 Found', recentEntries.length, 'recent entries');
      
      // Get semantic matches with lower threshold for temporal queries
      const semanticEntries = await performVectorSearch(query, userId, 5, 0.15, filters);
      console.log('🔍 Found', semanticEntries.length, 'semantic matches');
      
      // Combine and deduplicate entries
      const combinedEntries = [...recentEntries, ...semanticEntries];
      const uniqueEntries = new Map<string, VectorSearchResult>();
      
      combinedEntries.forEach(entry => {
        if (!uniqueEntries.has(entry.entryId)) {
          uniqueEntries.set(entry.entryId, entry);
        }
      });
      
      relevantEntries = Array.from(uniqueEntries.values()).slice(0, 8);
      console.log('🔄 Combined to', relevantEntries.length, 'unique entries for temporal query');
    } else {
      // Step 1b: Regular semantic vector search - prioritize relevance over recency
      // Use higher threshold for better quality results, especially for Search page
      const threshold = source === 'search' ? 0.25 : 0.15;
      relevantEntries = await performVectorSearch(query, userId, 8, threshold, filters, source);
      console.log(`🔍 Using semantic search with threshold ${threshold} for ${source || 'general'} search`);
    }
    
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
    filterType?: 'tags' | 'people' | 'date';
    tags?: string[];
    people?: string[];
    dateRange?: { from?: string; to?: string };
    type?: 'feed' | 'shared';
  },
  source?: 'feed' | 'search',
  customThreshold?: number
): Promise<VectorSearchResult[]> {
  try {
    console.log('🔀 Performing hybrid search:', { query, mode, limit, filters });

    // Apply Feed-specific improvements
    const threshold = customThreshold || (source === 'feed' ? 0.35 : 0.15);
    const searchLimit = source === 'feed' ? Math.min(limit * 3, 50) : limit * 2; // More candidates for Feed
    
    console.log(`🎯 Feed optimization: threshold=${threshold}, searchLimit=${searchLimit}, source=${source}`);

    // Check for temporal queries on Feed page
    const isTemporalQuery = source === 'feed' && detectTemporalQuery(query);
    console.log('⏰ Temporal query detected for Feed:', isTemporalQuery);

    let vectorResults: VectorSearchResult[] = [];
    let keywordResults: VectorSearchResult[] = [];

    if (isTemporalQuery) {
      // For temporal queries on Feed page, combine recent entries with hybrid search
      console.log('🕐 Using temporal search strategy for Feed...');
      
      // Get recent entries (last 30 days, sorted by date)
      const recentEntries = await getRecentEntries(userId, Math.floor(searchLimit / 2), filters);
      console.log('📅 Found', recentEntries.length, 'recent entries');
      
      // Get regular hybrid search results with remaining limit
      const remainingLimit = searchLimit - recentEntries.length;
      const [temporalVectorResults, temporalKeywordResults] = await Promise.all([
        performVectorSearch(query, userId, remainingLimit, threshold, filters, source),
        performKeywordSearch(query, userId, remainingLimit, filters)
      ]);
      
      // Combine recent entries with hybrid results, prioritizing recency for temporal queries
      vectorResults = [...recentEntries, ...temporalVectorResults];
      keywordResults = temporalKeywordResults;
      
      console.log('🔄 Combined temporal search: recent(' + recentEntries.length + ') + vector(' + temporalVectorResults.length + ') + keyword(' + temporalKeywordResults.length + ')');
    } else {
      // Regular hybrid search
      [vectorResults, keywordResults] = await Promise.all([
        performVectorSearch(query, userId, searchLimit, threshold, filters, source),
        performKeywordSearch(query, userId, searchLimit, filters) // Helper function for keyword search
      ]);
    }

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

    // Apply Feed-specific user context and final ranking
    let finalCandidates = Array.from(combinedResults.values());
    
    if (source === 'feed') {
      // Apply user context: boost recent interactions and viewing patterns
      finalCandidates = finalCandidates.map(result => {
        // Simple recency boost for recent entries (basic user context)
        const recencyBoost = Math.random() * 0.1; // Small random boost to add variety
        return {
          ...result,
          similarity: result.similarity + recencyBoost
        };
      });
    }

    // Sort and return top results
    const finalResults = finalCandidates
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
    filterType?: 'tags' | 'people' | 'date';
    tags?: string[];
    people?: string[];
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

    if (filters?.people && filters.people.length > 0) {
      // Filter entries tagged with specific people by name
      console.log('👥 Keyword search people filtering with:', filters.people);
      const { entryPersonTags, people } = await import('../../shared/schema');
      const { inArray, exists } = await import('drizzle-orm');
      
      // Use EXISTS subquery to find entries tagged with people whose names match the filter
      const peopleSubquery = db
        .select({ entryId: entryPersonTags.entryId })
        .from(entryPersonTags)
        .innerJoin(people, eq(people.id, entryPersonTags.personId))
        .where(
          and(
            eq(entryPersonTags.entryId, journalEntries.id),
            eq(people.userId, userId), // Only this user's people
            inArray(people.firstName, filters.people) // Match by first name for now
          )
        );
      
      whereConditions.push(exists(peopleSubquery));
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
        matchReason: `Keyword matches`,
        createdAt: entry.createdAt || undefined
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