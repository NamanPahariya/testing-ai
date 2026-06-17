# AI Chatbot — RAG, Tools & Human Approval (Vercel AI SDK v6)

A production-style chatbot built with **Next.js 15** and the **Vercel AI SDK v6**.
Designed as a video tutorial project: clean architecture, every major SDK feature in one place, nothing extra.

## Features

- 🔁 **Streaming text** — token-by-token streaming with `streamText` + `useChat`
- 🛠️ **Tool calling** — three server-side tools with full type safety via `InferUITools`
- 🪜 **Multi-step tool calls** — model can chain *search → answer* in one turn (`stopWhen: stepCountIs(5)`)
- 🙋 **Human-in-the-loop approval** — `needsApproval: true` on `sendEmail` with `addToolApprovalResponse`
- 📎 **File uploads in chat** — drop images/PDFs straight into the message
- 📚 **RAG** — upload `.txt` / `.md` to a knowledge base, retrieve relevant chunks at query time
- 🧮 **Embeddings + cosine similarity** — `embedMany` for ingestion, `cosineSimilarity` for retrieval
- 🗂️ **Vector store** — single-file JSON store (one class — swap for pgvector / Pinecone in one place)

## Quick start

```bash
# 1. Install
npm install

# 2. Add your OpenAI key
cp .env.example .env.local
# then edit .env.local and paste your key

# 3. Run
npm run dev
```

Open http://localhost:3000.

## What to demo (suggested video flow)

1. **Plain streaming** — ask anything ordinary, watch tokens stream in.
2. **Tool call (no approval)** — “What's the weather in Tokyo?” The `getCurrentWeather` tool card pops in, then the answer streams.
3. **RAG** — upload a `.md` file in the sidebar (e.g. company FAQ). Ask about it. Watch the `searchKnowledgeBase` card show the top-k chunks with similarity scores, then the model answers with citations. This is *multi-step*: tool call → tool result → final text, all in one turn.
4. **Human approval** — “Email alice@example.com that I'll be late tomorrow.” The model calls `sendEmail`, the UI shows an Approve / Deny card. Click Approve → conversation auto-resumes (`lastAssistantMessageIsCompleteWithApprovalResponses`) → server executes the tool → confirmation streams back.
5. **File in chat** — paperclip an image and ask “What's in this picture?”

## Architecture

```
app/
├── api/
│   ├── chat/route.ts         # streamText + tools + multi-step
│   ├── upload/route.ts       # ingest .txt/.md → chunk → embed → store
│   └── documents/route.ts    # list / delete documents
├── page.tsx                  # sidebar + chat layout
└── layout.tsx

components/
├── chat.tsx                  # useChat hook, composer, file attach, approvals wiring
├── message.tsx               # renders every part type (text / file / tools / approval)
└── knowledge-base.tsx        # upload UI + document list

lib/
├── ai/tools.ts               # ToolSet + InferUITools, typed ChatUIMessage
└── rag/
    ├── chunking.ts           # sentence-aware splitter
    ├── embeddings.ts         # embed / embedMany helpers
    └── vector-store.ts       # JSON-file backed store + cosineSimilarity search
```

## Key code paths

### Streaming + multi-step server tools (`app/api/chat/route.ts`)
```ts
const result = streamText({
  model: openai("gpt-4o-mini"),
  system: SYSTEM_PROMPT,
  messages: convertToModelMessages(messages),
  tools,
  stopWhen: stepCountIs(5),     // multi-step within a single request
});
return result.toUIMessageStreamResponse();
```

### Tool with human approval (`lib/ai/tools.ts`)
```ts
sendEmail: tool({
  description: "...",
  inputSchema: z.object({ to: z.string().email(), subject: z.string(), body: z.string() }),
  needsApproval: true,          // <-- this is all you need
  execute: async ({ to, subject }) => { /* runs ONLY after approval */ },
})
```

### Auto-resume after approval (`components/chat.tsx`)
```ts
useChat<ChatUIMessage>({
  transport: new DefaultChatTransport({ api: "/api/chat" }),
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
});
```

### RAG retrieval (`lib/ai/tools.ts` → `searchKnowledgeBase`)
```ts
const queryEmbedding = await embedQuery(query);
const results = await vectorStore.search(queryEmbedding, 4);
// cosineSimilarity is used inside vectorStore.search
```

### Full type safety
```ts
export const tools = { ... };
export type ChatTools = InferUITools<typeof tools>;
export type ChatUIMessage = UIMessage<never, UIDataTypes, ChatTools>;
// Then in components: part.type === 'tool-sendEmail' is type-narrowed.
```

## Swapping the vector store for production

The whole vector layer is one file: `lib/rag/vector-store.ts`. The public API
is just `addDocument` / `search` / `listDocuments` / `deleteDocument`. To go
to production, reimplement those four methods against:

- **Postgres + pgvector** (most common; works on Vercel via Neon/Supabase)
- **Pinecone / Qdrant / Turbopuffer** (managed vector DBs)
- **Upstash Vector** (serverless-friendly REST)

Nothing else in the codebase needs to change.

## Notes for deployment

The JSON-file store writes to `./data/vector-store.json`, which works locally
but **not on Vercel** (the filesystem is read-only at runtime). Swap the store
before deploying. Everything else — streaming, tools, approvals, uploads —
already works on Vercel serverless.

## Tech

- Next.js 15 (App Router) · React 19 · TypeScript
- `ai` v6 · `@ai-sdk/react` · `@ai-sdk/openai`
- Tailwind CSS · lucide-react · Zod
