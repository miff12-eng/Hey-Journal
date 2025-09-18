import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Use OpenAI's latest embedding model - text-embedding-3-large (1536 dimensions)
const EMBEDDING_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generate embeddings for text content using OpenAI's text-embedding-3-large
 */
export async function generateTextEmbedding(text: string): Promise<number[]> {
  try {
    console.log('🔢 Generating embedding for text length:', text.length);
    
    if (!text || text.trim().length === 0) {
      throw new Error('Text content is required for embedding generation');
    }

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.trim(),
      encoding_format: 'float',
      dimensions: EMBEDDING_DIMENSIONS
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error('No embedding returned from OpenAI');
    }

    console.log('✅ Successfully generated embedding with', embedding.length, 'dimensions');
    return embedding;

  } catch (error) {
    console.error('❌ Error generating text embedding:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate text embedding: ${message}`);
  }
}

/**
 * Convert array of numbers to PostgreSQL vector format
 */
export function formatVectorForPostgres(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Parse PostgreSQL vector format back to array of numbers
 */
export function parseVectorFromPostgres(vectorString: string): number[] {
  if (!vectorString) return [];
  
  // Remove brackets and split by comma
  const cleanString = vectorString.replace(/^\[|\]$/g, '');
  return cleanString.split(',').map(val => parseFloat(val.trim()));
}

/**
 * Calculate cosine similarity between two vectors
 */
export function calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have the same length for cosine similarity calculation');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0; // Avoid division by zero
  }

  return dotProduct / (normA * normB);
}

/**
 * Batch generate embeddings for multiple texts
 */
export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    console.log('🔢 Generating batch embeddings for', texts.length, 'texts');
    
    // Filter out empty texts
    const validTexts = texts.filter(text => text && text.trim().length > 0);
    
    if (validTexts.length === 0) {
      throw new Error('No valid texts provided for embedding generation');
    }

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: validTexts,
      encoding_format: 'float',
      dimensions: EMBEDDING_DIMENSIONS
    });

    const embeddings = response.data.map(item => item.embedding);
    console.log('✅ Successfully generated', embeddings.length, 'batch embeddings');
    
    return embeddings;

  } catch (error) {
    console.error('❌ Error generating batch embeddings:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate batch embeddings: ${message}`);
  }
}

export {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS
};