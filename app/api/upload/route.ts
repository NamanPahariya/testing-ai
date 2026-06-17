import { NextResponse } from "next/server";
import { chunkText } from "@/lib/rag/chunking";
import { embedChunks } from "@/lib/rag/embeddings";
import { vectorStore } from "@/lib/rag/vector-store";

export const maxDuration = 60;

const ACCEPTED_TYPES = ["text/plain", "text/markdown"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File too large (max 5MB)" },
        { status: 400 }
      );
    }

    const isMd = file.name.toLowerCase().endsWith(".md");
    if (!ACCEPTED_TYPES.includes(file.type) && !isMd) {
      return NextResponse.json(
        { error: "Only .txt and .md files are supported in this demo" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const chunks = chunkText(text, { chunkSize: 1000, chunkOverlap: 150 });

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "File appears to be empty" },
        { status: 400 }
      );
    }

    const embeddings = await embedChunks(chunks);
    const doc = await vectorStore.addDocument({
      name: file.name,
      chunks,
      embeddings,
    });

    return NextResponse.json({ document: doc });
  } catch (err) {
    console.error("upload error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
