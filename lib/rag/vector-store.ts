import { promises as fs } from "node:fs";
import path from "node:path";
import { cosineSimilarity } from "ai";

/**
 * A simple file-backed vector store.
 *
 * For a video / demo this keeps things obvious:
 *   - chunks live in memory as a Map
 *   - the whole map is persisted to a JSON file on disk
 *   - similarity search loads everything and uses cosineSimilarity from `ai`
 *
 * For production: swap this class for Postgres + pgvector, Pinecone, Qdrant,
 * Turbopuffer, etc. The public API (addDocument / search / listDocuments /
 * deleteDocument) is intentionally small so the swap is mechanical.
 */

export type StoredChunk = {
  id: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
};

export type StoredDocument = {
  id: string;
  name: string;
  chunkCount: number;
  createdAt: string;
};

export type SearchResult = {
  chunk: StoredChunk;
  similarity: number;
};

type Snapshot = {
  documents: StoredDocument[];
  chunks: StoredChunk[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "vector-store.json");

class VectorStore {
  private documents = new Map<string, StoredDocument>();
  private chunks = new Map<string, StoredChunk>();
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  private async ensureLoaded() {
    if (this.loaded) return;
    if (!this.loadPromise) this.loadPromise = this.load();
    await this.loadPromise;
  }

  private async load() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const raw = await fs.readFile(DATA_FILE, "utf8");
      const snap = JSON.parse(raw) as Snapshot;
      for (const doc of snap.documents) this.documents.set(doc.id, doc);
      for (const chunk of snap.chunks) this.chunks.set(chunk.id, chunk);
    } catch (err: unknown) {
      // First run — file does not exist yet. That's fine.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("vector-store: failed to load", err);
      }
    }
    this.loaded = true;
  }

  private async persist() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const snap: Snapshot = {
      documents: Array.from(this.documents.values()),
      chunks: Array.from(this.chunks.values()),
    };
    await fs.writeFile(DATA_FILE, JSON.stringify(snap, null, 2), "utf8");
  }

  async addDocument(params: {
    name: string;
    chunks: string[];
    embeddings: number[][];
  }): Promise<StoredDocument> {
    await this.ensureLoaded();
    if (params.chunks.length !== params.embeddings.length) {
      throw new Error("chunks and embeddings length mismatch");
    }

    const documentId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const doc: StoredDocument = {
      id: documentId,
      name: params.name,
      chunkCount: params.chunks.length,
      createdAt,
    };
    this.documents.set(documentId, doc);

    params.chunks.forEach((content, i) => {
      const chunkId = `${documentId}:${i}`;
      this.chunks.set(chunkId, {
        id: chunkId,
        documentId,
        documentName: params.name,
        chunkIndex: i,
        content,
        embedding: params.embeddings[i],
      });
    });

    await this.persist();
    return doc;
  }

  async search(
    queryEmbedding: number[],
    topK = 4
  ): Promise<SearchResult[]> {
    await this.ensureLoaded();
    const all = Array.from(this.chunks.values());
    if (all.length === 0) return [];

    const scored = all.map((chunk) => ({
      chunk,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  async listDocuments(): Promise<StoredDocument[]> {
    await this.ensureLoaded();
    return Array.from(this.documents.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.ensureLoaded();
    this.documents.delete(documentId);
    for (const [id, chunk] of this.chunks) {
      if (chunk.documentId === documentId) this.chunks.delete(id);
    }
    await this.persist();
  }
}

// Singleton across hot-reloads in dev.
declare global {
  // eslint-disable-next-line no-var
  var __vectorStore: VectorStore | undefined;
}

export const vectorStore: VectorStore =
  globalThis.__vectorStore ?? (globalThis.__vectorStore = new VectorStore());
