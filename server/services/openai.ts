import OpenAI from 'openai';
import { AiInsights } from '@shared/schema';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Text analysis prompt for journal entries
const ANALYSIS_PROMPT = `
You are an AI assistant that analyzes personal journal entries. Analyze the following journal entry and provide insights in JSON format.

Focus on:
- Summary: A brief 1-2 sentence summary of the main content
- Keywords: 3-5 key terms or topics mentioned
- Entities: People, places, organizations, or specific things mentioned
- Sentiment: Overall emotional tone (positive, negative, neutral)

Return only valid JSON in this exact format:
{
  "summary": "Brief summary here",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "entities": ["entity1", "entity2"],
  "sentiment": "positive" | "negative" | "neutral"
}

Journal entry:
`;

// Media analysis prompt for images/videos
const MEDIA_ANALYSIS_PROMPT = `
Analyze this image/video from a personal journal entry. Identify:
- Labels: Objects, activities, settings, or scenes visible
- People: Number of people (don't identify specific individuals, just count/describe general characteristics like "adult", "child", "group")

Return only valid JSON in this exact format:
{
  "labels": ["object1", "activity1", "setting1"],
  "people": ["description of people present, if any"]
}
`;

/**
 * Analyze text content of a journal entry using GPT-4
 */
export async function analyzeTextContent(content: string, title?: string | null): Promise<Partial<AiInsights>> {
  try {
    const fullText = title ? `Title: ${title}\n\nContent: ${content}` : content;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are a helpful AI assistant that analyzes personal journal entries and returns structured insights."
        },
        {
          role: "user",
          content: ANALYSIS_PROMPT + fullText
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent analysis
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    // Extract JSON from markdown code blocks if present
    const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || response.match(/(\{[\s\S]*\})/);
    const jsonString = jsonMatch ? jsonMatch[1] : response.trim();
    
    // Parse JSON response with error handling
    const analysis = JSON.parse(jsonString);
    
    return {
      summary: analysis.summary || "",
      keywords: Array.isArray(analysis.keywords) ? analysis.keywords : [],
      entities: Array.isArray(analysis.entities) ? analysis.entities : [],
      sentiment: analysis.sentiment || "neutral",
      labels: [], // Will be populated by media analysis
      people: [], // Will be populated by media analysis
    };

  } catch (error) {
    console.error('Error analyzing text content:', error);
    return {
      summary: "",
      keywords: [],
      entities: [],
      sentiment: "neutral",
      labels: [],
      people: [],
    };
  }
}

/**
 * Analyze media content (images/videos) using GPT-4V
 */
export async function analyzeMediaContent(mediaUrls: string[]): Promise<{ labels: string[]; people: string[] }> {
  if (!mediaUrls || mediaUrls.length === 0) {
    return { labels: [], people: [] };
  }

  try {
    // Analyze first media item (could be extended to handle multiple)
    let mediaUrl = mediaUrls[0];
    
    // Normalize URLs to ensure OpenAI can access them
    if (mediaUrl.startsWith('/')) {
      // Handle relative URLs
      if (!process.env.REPLIT_DOMAINS) {
        throw new Error('REPLIT_DOMAINS environment variable is required for public image access');
      }
      const baseUrl = `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
      mediaUrl = `${baseUrl}${mediaUrl}`;
    } else if (mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1')) {
      // Handle absolute localhost URLs
      if (!process.env.REPLIT_DOMAINS) {
        throw new Error('Cannot convert localhost URL: REPLIT_DOMAINS environment variable is required');
      }
      const baseUrl = `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
      // Extract the path from localhost URL
      const urlPath = mediaUrl.replace(/https?:\/\/(?:localhost:?\d*|127\.0\.0\.1:?\d*)/, '');
      mediaUrl = `${baseUrl}${urlPath}`;
    }
    
    // Validate that the URL is HTTPS (required for OpenAI)
    if (!mediaUrl.startsWith('https://')) {
      throw new Error(`Invalid URL for OpenAI analysis: must be HTTPS. Got: ${mediaUrl}`);
    }
    
    console.log('📸 Analyzing image URL:', mediaUrl);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system", 
          content: "You are a helpful AI assistant that analyzes images from personal journal entries."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: MEDIA_ANALYSIS_PROMPT
            },
            {
              type: "image_url",
              image_url: {
                url: mediaUrl
              }
            }
          ]
        }
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI vision model');
    }

    // Extract JSON from markdown code blocks if present
    const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || response.match(/(\{[\s\S]*\})/);
    const jsonString = jsonMatch ? jsonMatch[1] : response.trim();
    
    const analysis = JSON.parse(jsonString);
    
    return {
      labels: Array.isArray(analysis.labels) ? analysis.labels : [],
      people: Array.isArray(analysis.people) ? analysis.people : [],
    };

  } catch (error) {
    console.error('Error analyzing media content:', error);
    return { labels: [], people: [] };
  }
}

/**
 * Combine text and media analysis into complete AI insights
 */
export async function analyzeEntry(
  content: string, 
  title?: string | null, 
  mediaUrls?: string[]
): Promise<AiInsights> {
  console.log('🧠 Starting AI analysis for entry');
  
  try {
    // Run text and media analysis in parallel for efficiency
    const [textAnalysis, mediaAnalysis] = await Promise.all([
      analyzeTextContent(content, title),
      analyzeMediaContent(mediaUrls || [])
    ]);

    const insights: AiInsights = {
      summary: textAnalysis.summary || "",
      keywords: textAnalysis.keywords || [],
      entities: textAnalysis.entities || [],
      labels: mediaAnalysis.labels || [],
      people: mediaAnalysis.people || [],
      sentiment: textAnalysis.sentiment || "neutral",
    };

    console.log('🧠 AI analysis completed:', {
      keywordCount: insights.keywords.length,
      entityCount: insights.entities.length,
      labelCount: insights.labels.length,
      peopleCount: insights.people.length,
      sentiment: insights.sentiment
    });

    return insights;

  } catch (error) {
    console.error('Error in AI analysis pipeline:', error);
    
    // Return fallback insights if analysis fails
    return {
      summary: "",
      keywords: [],
      entities: [],
      labels: [],
      people: [],
      sentiment: "neutral",
    };
  }
}

/**
 * Intelligent semantic ranking using AI insights and content analysis
 * Ranks entries by semantic relevance to the search query
 */
export async function semanticRank(query: string, entries: any[]): Promise<any[]> {
  console.log('🔍 Semantic ranking requested for query:', query);
  
  if (!query || entries.length === 0) {
    return entries;
  }
  
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(word => word.length > 1);
  
  // Calculate semantic relevance score for each entry
  const scoredEntries = entries.map(entry => {
    let semanticScore = 0;
    let matchReasons = [];
    
    // Strong matches in title (highest weight)
    if (entry.title) {
      const titleLower = entry.title.toLowerCase();
      if (titleLower.includes(queryLower)) {
        semanticScore += 1.0;
        matchReasons.push('title exact match');
      } else if (queryWords.some(word => titleLower.includes(word))) {
        semanticScore += 0.7;
        matchReasons.push('title word match');
      }
    }
    
    // Content semantic matching
    if (entry.content) {
      const contentLower = entry.content.toLowerCase();
      if (contentLower.includes(queryLower)) {
        semanticScore += 0.8;
        matchReasons.push('content exact match');
      } else if (queryWords.some(word => contentLower.includes(word))) {
        const wordMatches = queryWords.filter(word => contentLower.includes(word)).length;
        semanticScore += 0.4 * (wordMatches / queryWords.length);
        matchReasons.push(`content partial match (${wordMatches}/${queryWords.length} words)`);
      }
    }
    
    // AI insights matching (this is the key for semantic search)
    if (entry.aiInsights) {
      // Keywords matching
      const matchingKeywords = (entry.aiInsights.keywords || []).filter((keyword: string) =>
        queryWords.some(word => keyword.toLowerCase().includes(word)) ||
        keyword.toLowerCase().includes(queryLower)
      );
      if (matchingKeywords.length > 0) {
        semanticScore += 0.6 * matchingKeywords.length;
        matchReasons.push(`AI keywords: ${matchingKeywords.join(', ')}`);
      }
      
      // Entities matching
      const matchingEntities = (entry.aiInsights.entities || []).filter((entity: string) =>
        queryWords.some(word => entity.toLowerCase().includes(word)) ||
        entity.toLowerCase().includes(queryLower)
      );
      if (matchingEntities.length > 0) {
        semanticScore += 0.6 * matchingEntities.length;
        matchReasons.push(`AI entities: ${matchingEntities.join(', ')}`);
      }
      
      // Labels matching (for image content)
      const matchingLabels = (entry.aiInsights.labels || []).filter((label: string) =>
        queryWords.some(word => label.toLowerCase().includes(word)) ||
        label.toLowerCase().includes(queryLower)
      );
      if (matchingLabels.length > 0) {
        semanticScore += 0.8 * matchingLabels.length; // Higher weight for visual content
        matchReasons.push(`image labels: ${matchingLabels.join(', ')}`);
      }
      
      // People matching
      const matchingPeople = (entry.aiInsights.people || []).filter((person: string) =>
        queryWords.some(word => person.toLowerCase().includes(word)) ||
        person.toLowerCase().includes(queryLower)
      );
      if (matchingPeople.length > 0) {
        semanticScore += 0.7 * matchingPeople.length;
        matchReasons.push(`people: ${matchingPeople.join(', ')}`);
      }
      
      // Summary semantic matching (fuzzy matching for concepts)
      if (entry.aiInsights.summary) {
        const summaryLower = entry.aiInsights.summary.toLowerCase();
        const summaryWordMatches = queryWords.filter(word => summaryLower.includes(word)).length;
        if (summaryWordMatches > 0) {
          semanticScore += 0.3 * (summaryWordMatches / queryWords.length);
          matchReasons.push(`summary concept match (${summaryWordMatches}/${queryWords.length})`);
        }
      }
    }
    
    // Tag matching
    const matchingTags = (entry.tags || []).filter((tag: string) =>
      queryWords.some(word => tag.toLowerCase().includes(word)) ||
      tag.toLowerCase().includes(queryLower)
    );
    if (matchingTags.length > 0) {
      semanticScore += 0.5 * matchingTags.length;
      matchReasons.push(`tags: ${matchingTags.join(', ')}`);
    }
    
    return {
      ...entry,
      _semanticScore: semanticScore,
      _matchReasons: matchReasons
    };
  });
  
  // Filter out entries with very low relevance (threshold of 0.1)
  const relevantEntries = scoredEntries.filter(entry => entry._semanticScore > 0.1);
  
  // Sort by semantic score (highest first)
  const rankedEntries = relevantEntries.sort((a, b) => b._semanticScore - a._semanticScore);
  
  console.log(`🎯 Semantic ranking: ${rankedEntries.length}/${entries.length} relevant entries found`);
  console.log(`🔍 DEBUG: All entries with scores:`);
  scoredEntries.forEach((entry, index) => {
    console.log(`  ${index + 1}. "${entry.title || entry.id.substring(0, 8)}" - Score: ${entry._semanticScore.toFixed(2)} - AI Insights: ${entry.aiInsights ? 'YES' : 'NO'} - Reasons: [${entry._matchReasons.join(', ')}]`);
  });
  
  return rankedEntries;
}