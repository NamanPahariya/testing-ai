import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";

// Pick once and reuse. text-embedding-3-small is cheap and 1536-dim.
export const embeddingModel = openai.embeddingModel("text-embedding-3-small");

export async function embedQuery(query: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: query,
  });
  return embedding;
}

export async function embedChunks(chunks: string[]): Promise<number[][]> {
  if (chunks.length === 0) return [];
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: chunks,
  });
  return embeddings;
}
