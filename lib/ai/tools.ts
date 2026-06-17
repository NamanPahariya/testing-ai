import { tool, type InferUITools, type UIDataTypes, type UIMessage } from "ai";
import { z } from "zod";
import { embedQuery } from "@/lib/rag/embeddings";
import { vectorStore } from "@/lib/rag/vector-store";

/**
 * 1) searchKnowledgeBase
 *    Server-executed, no approval needed.
 *    Demonstrates RAG: embed the query, run cosine similarity, return chunks.
 *
 * 2) getCurrentWeather
 *    Server-executed, no approval. Mocked so the demo works without an API key.
 *    Demonstrates a plain server-side tool call.
 *
 * 3) sendEmail
 *    Server-executed but `needsApproval: true`.
 *    Demonstrates human-in-the-loop / multi-step approval flow.
 */

export const tools = {
  searchKnowledgeBase: tool({
    description:
      "Search the user's uploaded knowledge base for information relevant " +
      "to their question. Use this whenever a question might be answered by " +
      "documents the user has uploaded. Returns the most relevant chunks.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("The natural-language query to search the KB for."),
    }),
    execute: async ({ query }) => {
      const queryEmbedding = await embedQuery(query);
      const results = await vectorStore.search(queryEmbedding, 4);

      if (results.length === 0) {
        return {
          found: false,
          message:
            "No documents have been uploaded to the knowledge base yet.",
          chunks: [],
        };
      }

      return {
        found: true,
        chunks: results.map((r) => ({
          source: r.chunk.documentName,
          similarity: Number(r.similarity.toFixed(3)),
          content: r.chunk.content,
        })),
      };
    },
  }),

  getCurrentWeather: tool({
    description:
      "Get the current weather for a city. Use this only when the user " +
      "asks about weather.",
    inputSchema: z.object({
      city: z.string().describe("City name"),
    }),
    execute: async ({ city }) => {
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.WEATHER_API_KEY}`)
      const data = await res.json();
      return {
        city: data.name,
        temperature: data.main.temp,
        condition: data.weather[0].description,
        humidity: data.main.humidity,
      };
    }
  }),

  sendEmail: tool({
    description:
      "Send an email on behalf of the user. ALWAYS require approval " +
      "before sending — never silently send.",
    inputSchema: z.object({
      to: z.string().email().describe("Recipient email address"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Plain-text email body"),
    }),
    needsApproval: true,
    execute: async ({ to, subject }) => {
      await new Promise((r) => setTimeout(r, 600));
      return {
        sent: true,
        to,
        subject,
        deliveredAt: new Date().toISOString(),
      };
    },
  }),
};


export type ChatTools = InferUITools<typeof tools>;
export type ChatUIMessage = UIMessage<never, UIDataTypes, ChatTools>;
