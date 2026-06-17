import { neon } from "@neondatabase/serverless";

/**
 * Production vector store: Neon Postgres + pgvector.
 *
 * This is a DROP-IN replacement for the local JSON file store.
 * Same public API — addDocument / search / listDocuments / deleteDocument —
 * so nothing else in the app changes.
 *
 * Differences from the demo store:
 *   - Cosine similarity is computed IN THE DATABASE using pgvector's `<=>`
 *     operator (cosine distance). similarity = 1 - distance.
 *     So we no longer import `cosineSimilarity` from `ai` here.
 *   - Works on Vercel's read-only serverless filesystem (no disk writes).
 *
 * Requires:
 *   - DATABASE_URL env var (Neon connection string)
 *   - the pgvector extension + tables created (see db/schema.sql)
 */

export type StoredChunk = {
  id: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  embedding: number[]; // kept in the type for API parity; not returned by search
};

export type StoredDocument = {
  id: string;
  name: string;
  chunkCount: number;
  createdAt: string;
};

export type SearchResult = {
  chunk: Omit<StoredChunk, "embedding">;
  similarity: number;
};

if (!process.env.DATABASE_URL) {
  // Fail loud and early instead of a confusing runtime error later.
  throw new Error("DATABASE_URL is not set. Add it to your environment.");
}

const sql = neon(process.env.DATABASE_URL);

// pgvector accepts the text form "[0.1,0.2,...]" and casts it with ::vector.
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

class VectorStore {
  async addDocument(params: {
    name: string;
    chunks: string[];
    embeddings: number[][];
  }): Promise<StoredDocument> {
    if (params.chunks.length !== params.embeddings.length) {
      throw new Error("chunks and embeddings length mismatch");
    }

    // 1) Insert the document row, let Postgres generate the UUID.
    const [doc] = (await sql`
      INSERT INTO documents (name, chunk_count)
      VALUES (${params.name}, ${params.chunks.length})
      RETURNING id, name, chunk_count, created_at
    `) as Array<{
      id: string;
      name: string;
      chunk_count: number;
      created_at: string;
    }>;

    // 2) Bulk-insert all chunks in a single parameterized statement.
    //    Build VALUES ($1,$2,$3,$4,$5), ($6,...) ... dynamically.
    const valuesSql: string[] = [];
    const queryParams: unknown[] = [];
    params.chunks.forEach((content, i) => {
      const base = i * 5;
      valuesSql.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::vector)`
      );
      queryParams.push(
        doc.id,
        doc.name,
        i,
        content,
        toVectorLiteral(params.embeddings[i])
      );
    });

    await sql.query(
      `INSERT INTO chunks (document_id, document_name, chunk_index, content, embedding)
       VALUES ${valuesSql.join(", ")}`,
      queryParams
    );

    return {
      id: doc.id,
      name: doc.name,
      chunkCount: doc.chunk_count,
      createdAt: doc.created_at,
    };
  }

  async search(
    queryEmbedding: number[],
    topK = 4
  ): Promise<SearchResult[]> {
    const literal = toVectorLiteral(queryEmbedding);

    // `<=>` is cosine distance (0 = identical). similarity = 1 - distance.
    const rows = (await sql`
      SELECT
        id,
        document_id,
        document_name,
        chunk_index,
        content,
        1 - (embedding <=> ${literal}::vector) AS similarity
      FROM chunks
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${topK}
    `) as Array<{
      id: string;
      document_id: string;
      document_name: string;
      chunk_index: number;
      content: string;
      similarity: number;
    }>;

    return rows.map((r) => ({
      similarity: Number(r.similarity),
      chunk: {
        id: r.id,
        documentId: r.document_id,
        documentName: r.document_name,
        chunkIndex: r.chunk_index,
        content: r.content,
      },
    }));
  }

  async listDocuments(): Promise<StoredDocument[]> {
    const rows = (await sql`
      SELECT id, name, chunk_count, created_at
      FROM documents
      ORDER BY created_at DESC
    `) as Array<{
      id: string;
      name: string;
      chunk_count: number;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      chunkCount: r.chunk_count,
      createdAt: r.created_at,
    }));
  }

  async deleteDocument(documentId: string): Promise<void> {
    // chunks are removed automatically via ON DELETE CASCADE.
    await sql`DELETE FROM documents WHERE id = ${documentId}`;
  }
}

export const vectorStore = new VectorStore();