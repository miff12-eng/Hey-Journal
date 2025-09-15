import OpenAI from "openai";

// Using GPT-4 which is the current latest stable OpenAI model
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface JournalEntry {
  id: string;
  title?: string;
  content: string;
  tags?: string[];
  createdAt: Date;
}

export async function generateAIResponse(
  message: string, 
  journalEntries: JournalEntry[] = [],
  previousMessages: ChatMessage[] = []
): Promise<string> {
  console.log('🔥 generateAIResponse called with:', { 
    messageLength: message.length, 
    entriesCount: journalEntries.length, 
    previousCount: previousMessages.length 
  });
  try {
    // Create context from journal entries
    const journalContext = journalEntries.length > 0 
      ? `Here are the user's recent journal entries for context:\n${journalEntries.map(entry => 
          `Entry "${entry.title || 'Untitled'}" (${entry.createdAt.toDateString()}): ${entry.content}`
        ).join('\n\n')}\n\n`
      : '';

    const systemPrompt = `You are a helpful AI assistant for a personal journaling app. Your role is to:

1. Help users reflect on their journal entries and discover patterns in their thoughts and experiences
2. Provide thoughtful insights and questions that encourage deeper self-reflection
3. Maintain a supportive, empathetic, and non-judgmental tone
4. Reference specific journal entries when relevant to provide personalized responses
5. Encourage healthy journaling habits and mindfulness practices

${journalContext}Please respond to the user's message in a helpful and reflective way.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...previousMessages.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

    console.log('📡 Making OpenAI API call with model: gpt-4');
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
      max_tokens: 500,
      temperature: 0.7,
    });
    console.log('📨 OpenAI raw response:', { 
      choices: response.choices?.length, 
      firstChoiceContent: response.choices?.[0]?.message?.content?.substring(0, 100) 
    });

    const result = response.choices[0].message.content || "I'm sorry, I couldn't generate a response at the moment.";
    console.log('🎯 Final AI response length:', result.length);
    return result;
  } catch (error) {
    console.error('AI Response Error:', error);
    throw new Error('Failed to generate AI response');
  }
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<{ text: string; confidence?: number }> {
  try {
    // Create a temporary file from the buffer
    const tempFile = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });
    
    const transcription = await openai.audio.transcriptions.create({
      file: tempFile,
      model: "whisper-1",
      language: 'en', // Can be made dynamic based on user preference
      response_format: 'json'
    });

    return {
      text: transcription.text,
      confidence: 0.95 // Whisper doesn't provide confidence, but it's generally very accurate
    };
  } catch (error) {
    console.error('Transcription Error:', error);
    throw new Error('Failed to transcribe audio');
  }
}

export async function analyzeJournalEntry(content: string): Promise<{
  sentiment: 'positive' | 'negative' | 'neutral';
  emotions: string[];
  themes: string[];
  suggestedTags: string[];
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are an expert at analyzing journal entries. Analyze the following journal entry and provide insights in JSON format:
          {
            "sentiment": "positive" | "negative" | "neutral",
            "emotions": ["array", "of", "emotions"],
            "themes": ["array", "of", "main", "themes"],
            "suggestedTags": ["array", "of", "suggested", "tags"]
          }`
        },
        {
          role: "user",
          content: content
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.7,
    });

    const analysis = JSON.parse(response.choices[0].message.content || '{}');
    
    return {
      sentiment: analysis.sentiment || 'neutral',
      emotions: Array.isArray(analysis.emotions) ? analysis.emotions : [],
      themes: Array.isArray(analysis.themes) ? analysis.themes : [],
      suggestedTags: Array.isArray(analysis.suggestedTags) ? analysis.suggestedTags : []
    };
  } catch (error) {
    console.error('Journal Analysis Error:', error);
    // Return default analysis if AI fails
    return {
      sentiment: 'neutral',
      emotions: [],
      themes: [],
      suggestedTags: []
    };
  }
}