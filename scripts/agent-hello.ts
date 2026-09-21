/**
 * Agent, step 2: send ONE question to a language model and look at exactly what comes back.
 *
 * Run:  npx tsx --env-file=.env.local scripts/agent-hello.ts
 *
 * Needs GEMINI_API_KEY in .env.local (a free key from Google AI Studio). Without it the script uses a
 * made-up reply of the same shape, so you can run it and read the output before you have a key.
 */

const MODEL = "gemini-3.8-flash"; // if the free tier refuses it, try "gemini-3.1-flash-lite"
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const QUESTION = "Përshëndetje! Çfarë është një bashki? Përgjigju në një fjali.";

/** The parts of the reply we read. The reply has more fields than this: print it to see them all. */
interface Reply {
  output_text?: string;
  steps?: { type: string; content?: { type: string; text?: string }[] }[];
  [field: string]: unknown;
}

// Same shape of code as anthropicProvider() in lib/fusion/llmFieldMatcher.ts:
// address + key header + a body with the model and the question.
async function askGemini(question: string, apiKey: string): Promise<Reply> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ model: MODEL, input: question }),
  });

  // Not 200-299: stop and show the status and the server's own explanation (401 = bad key, 429 = too many requests).
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function mockReply(): Reply {
  return {
    id: "mock-interaction",
    output_text: "Bashkia është njësia e qeverisjes vendore që administron shërbimet publike të një qyteti.",
    steps: [
      {
        type: "model_generated",
        content: [{ type: "text", text: "Bashkia është njësia e qeverisjes vendore që administron shërbimet publike të një qyteti." }],
      },
    ],
  };
}

/** The answer text: the shortcut field if present, otherwise the text pieces inside `steps`, joined. */
function textOf(reply: Reply): string {
  if (reply.output_text) return reply.output_text;
  return (reply.steps ?? [])
    .flatMap((step) => step.content ?? [])
    .filter((piece) => piece.type === "text")
    .map((piece) => piece.text ?? "")
    .join("");
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) console.log("GEMINI_API_KEY is not set: using a mock reply.\n");

  const reply = apiKey ? await askGemini(QUESTION, apiKey) : mockReply();

  console.log("--- the whole reply ---");
  console.log(JSON.stringify(reply, null, 2));
  console.log("\n--- just the answer ---");
  console.log(textOf(reply));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
