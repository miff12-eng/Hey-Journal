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
      model: "gpt-4o-mini", // Use cost-effective model for text analysis
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

    // Parse JSON response
    const analysis = JSON.parse(response);
    
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
    
    // Convert relative URLs to full URLs for OpenAI access
    if (mediaUrl.startsWith('/')) {
      const baseUrl = process.env.REPL_DOMAINS ? 
        `https://${process.env.REPL_DOMAINS.split(',')[0]}` : 
        'http://localhost:5000';
      mediaUrl = `${baseUrl}${mediaUrl}`;
    }
    
    console.log('📸 Analyzing image URL:', mediaUrl);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Use vision model for image analysis
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

    const analysis = JSON.parse(response);
    
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
 * Generate semantic embeddings for search ranking
 * Note: This is a placeholder for vector embeddings - could use OpenAI embeddings API
 */
export async function semanticRank(query: string, entries: any[]): Promise<any[]> {
  // For now, return entries as-is
  // TODO: Implement semantic ranking using embeddings
  console.log('🔍 Semantic ranking requested for query:', query);
  return entries;
}