import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { tools } from "@/lib/ai/tools";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a helpful AI assistant with three tools:

1. searchKnowledgeBase — search the user's uploaded documents. When a question
   might be answerable from their files, ALWAYS call this first, then answer
   using the returned chunks. Cite the source filename inline.

2. getCurrentWeather — get the weather for a city. Use only when the user
   asks about weather.

3. sendEmail — draft and send an email on the user's behalf. This requires
   the user's explicit approval, which the UI will surface — you do not
   need to ask for approval in text yourself, just call the tool.

Be concise. Stream your final answer in plain text or markdown.`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools,
    // Multi-step: model can call a tool, see the result, then call another
    // tool or write a final answer — all within one request.
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse({
    onError: (err) => {
      console.error("chat route error:", err);
      if (err instanceof Error) return err.message;
      return "Something went wrong.";
    },
  });
}
