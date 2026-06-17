/**
 * Very simple sentence-aware chunker.
 *
 * Splits a long string into overlapping chunks of roughly `chunkSize`
 * characters. Tries to break at sentence/paragraph boundaries so chunks
 * read as natural pieces of text rather than mid-word cuts.
 *
 * Real production chunkers (LangChain, llama-index) do a lot more, but
 * this is enough for a clean RAG demo.
 */

export function chunkText(
  text: string,
  options: { chunkSize?: number; chunkOverlap?: number } = {}
): string[] {
  const chunkSize = options.chunkSize ?? 1000;
  const chunkOverlap = options.chunkOverlap ?? 150;

  // Normalise whitespace.
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (clean.length === 0) return [];
  if (clean.length <= chunkSize) return [clean];

  // Split into "sentences" (best-effort, no regex tricks needed).
  const sentences = clean
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    // Sentence alone is too big -> hard-split it.
    if (sentence.length > chunkSize) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < sentence.length; i += chunkSize - chunkOverlap) {
        chunks.push(sentence.slice(i, i + chunkSize));
      }
      continue;
    }

    if ((current + " " + sentence).trim().length <= chunkSize) {
      current = (current + " " + sentence).trim();
    } else {
      chunks.push(current);
      // Carry over the tail of the previous chunk for overlap.
      const tail = current.slice(-chunkOverlap);
      current = (tail + " " + sentence).trim();
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
