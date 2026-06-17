import { NextResponse } from "next/server";
import { vectorStore } from "@/lib/rag/vector-store";

export async function GET() {
  const documents = await vectorStore.listDocuments();
  return NextResponse.json({ documents });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  await vectorStore.deleteDocument(id);
  return NextResponse.json({ ok: true });
}
