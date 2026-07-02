export async function getEmbedding(client, text, provider = 'gemini') {
  if (!text) {
    return new Array(768).fill(0);
  }

  // 1. Gemini embedding generation
  if ((provider === 'gemini' || client?.models?.embedContent) && client?.models?.embedContent) {
    try {
      const response = await client.models.embedContent({
        model: 'gemini-embedding-001',
        contents: text
      });
      if (response?.embeddings?.[0]?.values) {
        return response.embeddings[0].values;
      }
    } catch (err) {
      console.error('[EmbeddingHelper] Gemini embedding generation failed:', err.message);
    }
  }

  // 2. OpenAI embedding generation
  if ((provider === 'openai' || client?.embeddings?.create) && client?.embeddings?.create) {
    try {
      const response = await client.embeddings.create({
        model: 'text-embedding-3-small',
        input: text
      });
      if (response?.data?.[0]?.embedding) {
        // OpenAI text-embedding-3-small returns 1536 dimensions. 
        // Gemini returns 768. If we want compatibility, we can just return the raw vector,
        // since the local index / cosine similarity calculation works with any dimension 
        // as long as the query and index item dimensions match.
        return response.data[0].embedding;
      }
    } catch (err) {
      console.error('[EmbeddingHelper] OpenAI embedding generation failed:', err.message);
    }
  }

  // Fallback
  return new Array(768).fill(0);
}
