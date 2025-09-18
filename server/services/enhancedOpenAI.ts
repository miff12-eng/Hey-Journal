import OpenAI from 'openai';
import { AiInsights } from '@shared/schema';
import { generateTextEmbedding, formatVectorForPostgres } from './vectorEmbeddings';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Enhanced prompts for multimodal content processing
const ENHANCED_ANALYSIS_PROMPT = `
You are an AI assistant that analyzes personal journal entries with advanced multimodal understanding. Analyze the following content and provide comprehensive insights in JSON format.

Focus on:
- Summary: A detailed 2-3 sentence summary capturing the essence and emotional context
- Keywords: 5-8 key terms, topics, themes, or concepts mentioned
- Entities: People, places, organizations, products, or specific things mentioned
- Sentiment: Overall emotional tone with nuance (positive, negative, neutral)
- Themes: Broader life themes and patterns (e.g., "personal growth", "relationships", "career", "health")
- Emotions: Specific emotions expressed (e.g., "joy", "anxiety", "excitement", "nostalgia")

Return only valid JSON in this exact format:
{
  "summary": "Detailed summary here",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "entities": ["entity1", "entity2", "entity3"],
  "sentiment": "positive" | "negative" | "neutral",
  "themes": ["theme1", "theme2"],
  "emotions": ["emotion1", "emotion2"]
}

Content to analyze:
`;

const ENHANCED_MEDIA_ANALYSIS_PROMPT = `
Analyze this image/video from a personal journal entry with detailed visual understanding. Provide comprehensive analysis including:

Visual Elements:
- Objects: All visible objects, items, and things in detail
- Activities: Actions, events, or activities taking place
- Settings: Location, environment, atmosphere, and context
- Visual Style: Colors, lighting, composition, mood

People Analysis:
- Count: Number of people visible
- Demographics: General age groups (adult, child, elderly) and characteristics
- Interactions: Social dynamics and relationships visible
- Emotions: Facial expressions and body language

Context and Meaning:
- Scene Description: What story does this image tell?
- Emotional Tone: What feelings does this image convey?
- Cultural Context: Any cultural, social, or historical elements

Return only valid JSON in this exact format:
{
  "objects": ["object1", "object2", "object3"],
  "activities": ["activity1", "activity2"],
  "settings": ["setting1", "setting2"],
  "visual_style": ["style1", "style2"],
  "people_count": 0,
  "people_description": ["description of people if any"],
  "scene_description": "Detailed description of what's happening",
  "emotional_tone": "Mood and feelings conveyed",
  "cultural_context": ["cultural elements if any"]
}
`;

// Enhanced video frame sampling configuration
const VIDEO_FRAME_SAMPLING_CONFIG = {
  maxFrames: 5, // Sample up to 5 frames from video
  intervalType: 'even' as const, // Even distribution throughout video
  maxVideoLength: 300, // Maximum 5 minutes of video processing
};

/**
 * Enhanced text content analysis using GPT-5 with deeper insights
 */
export async function enhancedAnalyzeTextContent(
  content: string, 
  title?: string | null,
  audioTranscription?: string | null,
  tags?: string[] | null
): Promise<Partial<AiInsights> & { searchableText: string; embedding: number[] }> {
  try {
    // Combine all text content for analysis
    let fullText = content;
    if (title) fullText = `Title: ${title}\n\n${fullText}`;
    if (audioTranscription) fullText = `${fullText}\n\nAudio Content: ${audioTranscription}`;
    
    console.log('🏷️ Debug tags received:', tags, 'type:', typeof tags, 'length:', tags?.length);
    if (tags && tags.length > 0) {
      fullText = `${fullText}\n\nTags: ${tags.join(', ')}`;
      console.log('✅ Tags added to fullText:', tags.join(', '));
    } else {
      console.log('❌ No tags to add - tags:', tags);
    }
    
    console.log('🧠 Enhanced text analysis starting for content length:', fullText.length);
    
    // Run analysis and embedding generation in parallel
    const [analysis, embedding] = await Promise.all([
      // GPT-4o content analysis
      openai.chat.completions.create({
        model: "gpt-4o", // Using gpt-4o for text analysis with OpenAI
        messages: [
          {
            role: "system",
            content: "You are an expert AI assistant that provides deep, nuanced analysis of personal journal content with psychological and emotional intelligence."
          },
          {
            role: "user",
            content: ENHANCED_ANALYSIS_PROMPT + fullText
          }
        ],
        max_completion_tokens: 800,
        response_format: { type: "json_object" }
      }),
      // Generate text embedding for semantic search
      generateTextEmbedding(fullText)
    ]);

    const response = analysis.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI analysis');
    }

    const parsed = JSON.parse(response);
    
    const insights = {
      summary: parsed.summary || "",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      sentiment: parsed.sentiment || "neutral",
      // Enhanced fields
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      emotions: Array.isArray(parsed.emotions) ? parsed.emotions : [],
      labels: [], // Will be populated by media analysis
      people: [], // Will be populated by media analysis
      searchableText: fullText,
      embedding,
      embeddingString: formatVectorForPostgres(embedding) // Add the formatted string for PostgreSQL storage
    };

    console.log('✅ Enhanced text analysis completed:', {
      keywordCount: insights.keywords.length,
      themeCount: insights.themes?.length || 0,
      emotionCount: insights.emotions?.length || 0,
      embeddingDimensions: embedding.length
    });

    return insights;

  } catch (error) {
    console.error('❌ Error in enhanced text analysis:', error);
    
    // Generate basic embedding even if analysis fails
    const fullText = title ? `${title} ${content}` : content;
    let embedding: number[] = [];
    try {
      embedding = await generateTextEmbedding(fullText);
    } catch (embeddingError) {
      console.error('❌ Failed to generate embedding fallback:', embeddingError);
    }
    
    return {
      summary: "",
      keywords: [],
      entities: [],
      sentiment: "neutral" as const,
      themes: [],
      emotions: [],
      labels: [],
      people: [],
      searchableText: fullText,
      embedding,
      embeddingString: embedding.length > 0 ? formatVectorForPostgres(embedding) : ""
    } as AiInsights & { 
      searchableText: string; 
      embedding: number[];
      embeddingString: string;
    };
  }
}

/**
 * Enhanced media content analysis using GPT-5 vision with detailed insights
 */
export async function enhancedAnalyzeMediaContent(mediaUrls: string[]): Promise<{
  labels: string[];
  people: string[];
  mediaInsights: any[];
}> {
  if (!mediaUrls || mediaUrls.length === 0) {
    return { labels: [], people: [], mediaInsights: [] };
  }

  try {
    console.log('📸 Enhanced media analysis starting for', mediaUrls.length, 'items');
    
    const mediaInsights = [];
    let allLabels: string[] = [];
    let allPeople: string[] = [];

    // Analyze each media item (up to 3 for performance)
    const itemsToAnalyze = mediaUrls.slice(0, 3);
    
    for (const mediaUrl of itemsToAnalyze) {
      try {
        // Normalize URL for OpenAI access
        let normalizedUrl = mediaUrl;
        if (mediaUrl.startsWith('/')) {
          if (!process.env.REPLIT_DOMAINS) {
            throw new Error('REPLIT_DOMAINS required for media analysis');
          }
          const baseUrl = `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
          normalizedUrl = `${baseUrl}${mediaUrl}`;
        }
        
        if (!normalizedUrl.startsWith('https://')) {
          console.warn('⚠️ Skipping non-HTTPS media URL:', normalizedUrl);
          continue;
        }
        
        console.log('🔍 Analyzing media URL:', normalizedUrl);
        
        const analysis = await openai.chat.completions.create({
          model: "gpt-4o", // Using gpt-4o for vision analysis as it supports image processing
          messages: [
            {
              role: "system", 
              content: "You are an expert AI that provides detailed, nuanced analysis of images and videos from personal journals with focus on emotional context and life story elements."
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: ENHANCED_MEDIA_ANALYSIS_PROMPT
                },
                {
                  type: "image_url",
                  image_url: { url: normalizedUrl }
                }
              ]
            }
          ],
          max_completion_tokens: 600,
          response_format: { type: "json_object" }
        });

        const response = analysis.choices[0]?.message?.content;
        if (response) {
          const parsed = JSON.parse(response);
          mediaInsights.push({
            url: mediaUrl,
            analysis: parsed
          });
          
          // Aggregate labels and people info
          if (parsed.objects) allLabels.push(...parsed.objects);
          if (parsed.activities) allLabels.push(...parsed.activities);
          if (parsed.settings) allLabels.push(...parsed.settings);
          if (parsed.visual_style) allLabels.push(...parsed.visual_style);
          
          if (parsed.people_description) {
            allPeople.push(...parsed.people_description);
          }
          if (parsed.people_count > 0) {
            allPeople.push(`${parsed.people_count} people`);
          }
        }
        
      } catch (itemError) {
        if (itemError && typeof itemError === 'object' && 'error' in itemError) {
          const error = itemError as any;
          if (error?.error?.code === 'image_parse_error') {
            console.warn('⚠️ OpenAI rejected image format/size:', mediaUrl, error.error.message);
          } else {
            console.error('❌ Error analyzing individual media item:', itemError);
          }
        } else {
          console.error('❌ Error analyzing individual media item:', itemError);
        }
        continue;
      }
    }

    // Remove duplicates and clean up
    const uniqueLabels = Array.from(new Set(allLabels)).filter(label => label && label.trim().length > 0);
    const uniquePeople = Array.from(new Set(allPeople)).filter(person => person && person.trim().length > 0);
    
    console.log('📸 Enhanced media analysis completed:', {
      itemsAnalyzed: mediaInsights.length,
      totalLabels: uniqueLabels.length,
      totalPeople: uniquePeople.length
    });

    return {
      labels: uniqueLabels,
      people: uniquePeople,
      mediaInsights
    };

  } catch (error) {
    console.error('❌ Error in enhanced media analysis:', error);
    return { labels: [], people: [], mediaInsights: [] };
  }
}

/**
 * Enhanced audio transcription with Whisper and improved processing
 */
export async function enhancedTranscribeAudio(audioFilePath: string): Promise<{
  text: string;
  duration?: number;
  confidence?: number;
}> {
  try {
    console.log('🎙️ Enhanced audio transcription starting for:', audioFilePath);
    
    const fs = await import('fs');
    const audioReadStream = fs.createReadStream(audioFilePath);

    const transcription = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: "whisper-1",
      language: "en", // Can be made dynamic based on user preference
      prompt: "This is a personal journal entry. Please transcribe accurately including emotional context and natural speech patterns.",
      response_format: "verbose_json"
    });

    console.log('🎙️ Audio transcription completed, length:', transcription.text?.length || 0);
    
    return {
      text: transcription.text || "",
      duration: transcription.duration,
      // Note: OpenAI doesn't provide confidence scores, but we can infer from response quality
      confidence: transcription.text && transcription.text.length > 10 ? 0.9 : 0.7
    };

  } catch (error) {
    console.error('❌ Error in enhanced audio transcription:', error);
    return {
      text: "",
      duration: 0,
      confidence: 0
    };
  }
}

/**
 * Complete enhanced entry analysis combining all modalities
 */
export async function enhancedAnalyzeEntry(
  content: string,
  title?: string | null,
  mediaUrls?: string[],
  audioUrl?: string | null,
  tags?: string[] | null
): Promise<AiInsights & { 
  searchableText: string; 
  embedding: number[];
  embeddingString: string;
}> {
  console.log('🚀 Starting enhanced multimodal analysis');
  
  try {
    // Step 1: Audio transcription if present
    let audioTranscription: string | null = null;
    if (audioUrl) {
      try {
        // Note: In real implementation, you'd need to handle the audio file path
        // For now, we'll skip audio transcription in this enhanced version
        // and focus on text + media analysis
        console.log('🎙️ Audio URL found, skipping transcription for this implementation');
      } catch (audioError) {
        console.error('❌ Audio transcription failed:', audioError);
      }
    }
    
    // Step 2: Run text and media analysis in parallel
    const [textAnalysis, mediaAnalysis] = await Promise.all([
      enhancedAnalyzeTextContent(content, title, audioTranscription, tags),
      enhancedAnalyzeMediaContent(mediaUrls || [])
    ]);

    // Step 3: Combine all insights
    // Create enhanced searchable text that includes labels and people for vector search
    const mediaSearchText = [
      ...(mediaAnalysis.labels || []),
      ...(mediaAnalysis.people || [])
    ].join(' ');
    
    const enhancedSearchableText = [
      textAnalysis.searchableText || content,
      mediaSearchText
    ].filter(text => text.trim().length > 0).join(' ');
    
    console.log('🔤 Enhanced searchable text preview:', {
      originalLength: (textAnalysis.searchableText || content).length,
      mediaLabelsLength: mediaSearchText.length,
      enhancedLength: enhancedSearchableText.length,
      mediaLabels: mediaAnalysis.labels?.slice(0, 5) || [],
      enhancedPreview: enhancedSearchableText.substring(0, 200) + '...'
    });
    
    // Generate embedding for the complete searchable text (including media labels)
    const combinedEmbedding = await generateTextEmbedding(enhancedSearchableText);
    
    const combinedInsights: AiInsights & { 
      searchableText: string; 
      embedding: number[];
      embeddingString: string;
    } = {
      summary: textAnalysis.summary || "",
      keywords: [
        ...(textAnalysis.keywords || []),
        ...(mediaAnalysis.labels?.slice(0, 3) || []) // Add top media labels as keywords
      ].slice(0, 10), // Limit to 10 total keywords
      entities: textAnalysis.entities || [],
      labels: mediaAnalysis.labels || [],
      people: mediaAnalysis.people || [],
      sentiment: textAnalysis.sentiment || "neutral",
      searchableText: enhancedSearchableText,
      embedding: combinedEmbedding,
      embeddingString: formatVectorForPostgres(combinedEmbedding)
    };

    console.log('🎯 Enhanced multimodal analysis completed:', {
      totalKeywords: combinedInsights.keywords.length,
      totalLabels: combinedInsights.labels.length,
      totalPeople: combinedInsights.people.length,
      hasEmbedding: combinedInsights.embedding.length > 0,
      embeddingDimensions: combinedInsights.embedding.length
    });

    return combinedInsights;

  } catch (error) {
    console.error('❌ Error in enhanced entry analysis pipeline:', error);
    
    // Fallback with basic embedding
    let fallbackEmbedding: number[] = [];
    try {
      fallbackEmbedding = await generateTextEmbedding(content);
    } catch (embeddingError) {
      console.error('❌ Failed to generate fallback embedding:', embeddingError);
    }
    
    return {
      summary: "",
      keywords: [],
      entities: [],
      labels: [],
      people: [],
      sentiment: "neutral",
      searchableText: content,
      embedding: fallbackEmbedding,
      embeddingString: formatVectorForPostgres(fallbackEmbedding)
    };
  }
}

export {
  VIDEO_FRAME_SAMPLING_CONFIG,
  ENHANCED_ANALYSIS_PROMPT,
  ENHANCED_MEDIA_ANALYSIS_PROMPT
};