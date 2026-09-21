/**
 * Checks the agent end to end WITHOUT a key or a network: the loop, the tools, citations, the Gemini
 * request/response handling (against a fake server that answers in Gemini's documented format), search
 * by meaning, the offline model, privacy, and the API route.
 *
 * Run:  npx tsx scripts/test-agent.ts
 */
import { loadCommandCenterData } from "../lib/commandCenter/aggregate";
import { runAgent } from "../lib/agent/agent";
import { geminiEmbedder } from "../lib/agent/embeddings";
import { ModelError, geminiModel } from "../lib/agent/gemini";
import { offlineModel, parseIntent } from "../lib/agent/offline";
import { RefBook } from "../lib/agent/records";
import { TOOLS } from "../lib/agent/tools";
import type { ToolContext } from "../lib/agent/types";
import { GET, POST } from "../app/api/agent/route";
import { formatSpoken, joinSpoken, speechErrorMessage, transcriptOf, type SpeechEvent } from "../components/command-center/agent/speech";

let failures = 0;
let checks = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  checks++;
  if (ok) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        got: ${JSON.stringify(detail)}` : ""}`);
  }
}

const data = loadCommandCenterData();
const freshCtx = (embed?: ToolContext["embed"]): ToolContext => ({ data, refs: new RefBook(), embed });
const tool = (name: string) => TOOLS.find((t) => t.name === name)!;
type Obj = Record<string, unknown>;

/** A fake Gemini: answers each call with the next canned reply and records what it was sent. */
type FakeReply = Obj | { status: number; body: string };
function fakeGemini(replies: FakeReply[]) {
  const calls: { url: string; headers: Obj; body: Obj }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Obj, body: JSON.parse(String(init.body)) });
    const next = replies[Math.min(calls.length - 1, replies.length - 1)];
    if ("status" in next && typeof next.status === "number") return new Response((next as { body: string }).body, { status: next.status });
    return new Response(JSON.stringify(next), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

async function main() {
  console.log("\nTools (numbers must equal the dashboard's)");
  const overview = (await tool("city_overview").run({}, freshCtx())) as Obj;
  check("48 requests in total", overview.totalRequests === 48, overview.totalRequests);
  check("21 resolved / 15 in progress / 12 open", JSON.stringify(overview.byStatus) === JSON.stringify({ resolved: 21, in_progress: 15, open: 12 }), overview.byStatus);
  const z3 = (await tool("count_requests").run({ zone: "Zona 3", status: "unresolved" }, freshCtx())) as Obj;
  check("Zona 3 has 3 unresolved", z3.total === 3, z3);
  const byZone = (await tool("count_requests").run({ group_by: "zone" }, freshCtx())) as { groups: { count: number }[] };
  check("counts by zone add up to 48", byZone.groups.reduce((a, g) => a + g.count, 0) === 48);
  check("an unknown zone is an error the model can read", "error" in ((await tool("count_requests").run({ zone: "Zona 99" }, freshCtx())) as Obj));
  check("an unknown status is an error the model can read", "error" in ((await tool("count_requests").run({ status: "banana" }, freshCtx())) as Obj));
  check("negative budget is rejected", "error" in ((await tool("build_work_plan").run({ budget_leke: -5 }, freshCtx())) as Obj));
  const plan = (await tool("build_work_plan").run({ budget_leke: 1_300_000 }, freshCtx())) as Obj;
  check("plan funds 5 requests for 1.3 mln L", plan.fundedRequests === 5, plan.fundedRequests);

  console.log("\nPrivacy: no citizen name ever reaches a tool result");
  const names = data.records.map((r) => r.citizen_name).filter((n): n is string => Boolean(n));
  const ctxAll = freshCtx();
  const dump = JSON.stringify([
    await tool("city_overview").run({}, ctxAll),
    ...(await Promise.all(data.zones.map((z) => tool("zone_summary").run({ zone: z.zoneId }, ctxAll)))),
    await tool("search_requests").run({ limit: 15 }, ctxAll),
    await tool("search_requests").run({ text: "asfalt", limit: 15 }, ctxAll),
    await tool("build_work_plan").run({ budget_leke: 9_000_000 }, ctxAll),
  ]);
  check(`none of ${names.length} citizen names appear`, !names.some((n) => dump.includes(n)), names.find((n) => dump.includes(n)));

  console.log("\nAgent loop with a scripted model (Gemini's documented format)");
  {
    const fake = fakeGemini([
      { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "search_requests", args: { zone: "area-3", status: "unresolved" } }, thoughtSignature: "SIG-1" }] }, finishReason: "STOP" }] },
      { candidates: [{ content: { role: "model", parts: [{ text: "Zona 3 ka kërkesa të hapura [R1], por [R99] nuk ekziston." }] }, finishReason: "STOP" }] },
    ]);
    const result = await runAgent({ turns: [{ role: "user", text: "Çfarë ka në Zonën 3?" }], model: geminiModel("KEY", "test-model", fake.impl), ctx: freshCtx() });
    const [first, second] = fake.calls;
    check("calls the documented generateContent endpoint", first.url === "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent", first.url);
    check("sends the key in x-goog-api-key", first.headers["x-goog-api-key"] === "KEY");
    check("sends a system instruction", typeof (first.body.systemInstruction as { parts: { text: string }[] }).parts[0].text === "string");
    const decls = (first.body.tools as { functionDeclarations: { name: string; description: string; parameters: { type: string } }[] }[])[0].functionDeclarations;
    check("declares all 7 tools with object schemas", decls.length === 7 && decls.every((d) => d.name && d.description && d.parameters.type === "object"), decls.length);
    check("first request is just the user's question", JSON.stringify(first.body.contents) === JSON.stringify([{ role: "user", parts: [{ text: "Çfarë ka në Zonën 3?" }] }]));
    const contents2 = second.body.contents as { role: string; parts: Obj[] }[];
    check("second request replays the model's turn verbatim (thought signature kept)", contents2[1].role === "model" && contents2[1].parts[0].thoughtSignature === "SIG-1", contents2[1]);
    const fr = contents2[2].parts[0].functionResponse as { name: string; response: { result: { totalMatches: number } } };
    check("second request carries the tool result as a functionResponse", contents2[2].role === "user" && fr.name === "search_requests" && fr.response.result.totalMatches === 3, fr);
    check("a real citation [R1] is kept", result.citations.length === 1 && result.citations[0].ref === "R1" && result.answer.includes("[R1]"), result.citations);
    check("an invented citation [R99] is removed", !result.answer.includes("R99"), result.answer);
    check("the trace shows the tool call", result.trace.length === 1 && result.trace[0].tool === "search_requests" && result.trace[0].summary.includes("3"), result.trace);
    check("mode is gemini", result.mode === "gemini" && result.model === "test-model");
  }
  {
    const say = async (text: string, question = "x") => {
      const f = fakeGemini([{ candidates: [{ content: { role: "model", parts: [{ text }] } }] }]);
      return { f, r: await runAgent({ turns: [{ role: "user", text: question }], model: geminiModel("KEY", "m", f.impl), ctx: freshCtx() }) };
    };
    const marked = (await say("Kalaja e Elbasanit është një monument i njohur.\n[[general]]")).r;
    check("the [[general]] mark sets the flag and is removed from the text", marked.general === true && !marked.answer.includes("[[") && marked.answer.startsWith("Kalaja"), marked);
    const tooling = fakeGemini([
      { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "count_requests", args: { zone: "area-3" } } }] } }] },
      { candidates: [{ content: { role: "model", parts: [{ text: "Zona 3 ka 5 kërkesa. Kalaja është monument.\n[[general]]" }] } }] },
    ]);
    const mixed = await runAgent({ turns: [{ role: "user", text: "x" }], model: geminiModel("KEY", "m", tooling.impl), ctx: freshCtx() });
    check("a mixed answer (data + own knowledge) is flagged even though a tool was used", mixed.general === true && mixed.trace.length === 1, mixed);
    check("a short refusal without the mark is not flagged", (await say("Më vjen keq, ndihmoj vetëm për Elbasanin.")).r.general === false);
    check("a long tool-free answer without the mark is flagged as a backstop", (await say("Elbasani është një qytet i vjetër. ".repeat(20))).r.general === true);
    const hello = fakeGemini([{ candidates: [{ content: { role: "model", parts: [{ text: "Përshëndetje! Si mund të ndihmoj?" }] } }] }]);
    const short = await runAgent({ turns: [{ role: "user", text: "Përshëndetje" }], model: geminiModel("KEY", "m", hello.impl), ctx: freshCtx() });
    check("a short greeting is not flagged", short.general === false, short);
    const fake = (await say("x")).f;
    const sys = (fake.calls[0].body.systemInstruction as { parts: { text: string }[] }).parts[0].text;
    check("the system prompt allows general Elbasan questions, keeps data answers tool-only, and asks for the mark", /GENERAL questions about Elbasan/.test(sys) && /use ONLY the tools/.test(sys) && /\[\[general\]\]/.test(sys));
  }
  {
    const fake = fakeGemini([{ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "no_such_tool", args: {} } }] } }] }]);
    const result = await runAgent({ turns: [{ role: "user", text: "x" }], model: geminiModel("KEY", "m", fake.impl), ctx: freshCtx(), maxSteps: 3 });
    check("calling a tool that doesn't exist is survived, then the step limit is reported", result.trace.length === 3 && result.trace[0].error === true && Boolean(result.notice), result.trace.length);
  }

  console.log("\nCitation clean-up");
  {
    const ctx = freshCtx();
    tool("search_requests").run({ zone: "area-3" }, ctx);
    const r = await runAgent({
      turns: [{ role: "user", text: "x" }],
      model: { kind: "gemini", label: "fake", step: async () => ({ text: "1. **R1** (Zona 3) është hapur. Edhe R2, por R77 s'ekziston.", toolCalls: [] }) },
      ctx,
    });
    check("a bold or bare real ref becomes a citation; an unknown one is left alone", r.answer.includes("[R1]") && r.answer.includes("[R2]") && !r.answer.includes("**R1**") && r.citations.length === 2, r.answer);
  }

  console.log("\nGemini errors");
  {
    const bad = fakeGemini([{ status: 400, body: '{"error":{"message":"bad request"}}' }]);
    let err: unknown;
    await geminiModel("K", "m", bad.impl).step("s", [{ role: "user", text: "hi" }], TOOLS).catch((e) => (err = e));
    check("HTTP 400 becomes a ModelError with the status", err instanceof ModelError && err.status === 400, String(err));
    const blocked = fakeGemini([{ promptFeedback: { blockReason: "SAFETY" } }]);
    err = undefined;
    await geminiModel("K", "m", blocked.impl).step("s", [{ role: "user", text: "hi" }], TOOLS).catch((e) => (err = e));
    check("a blocked prompt becomes a ModelError", err instanceof ModelError && /SAFETY/.test(err.message), String(err));
    let tries = 0;
    const stalling = (async () => {
      tries++;
      if (tries === 1) throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const afterStall = await geminiModel("K", "m", stalling).step("s", [{ role: "user", text: "hi" }], TOOLS);
    check("a stalled first attempt is retried once and then succeeds", tries === 2 && afterStall.text === "ok", tries);
    const limited = fakeGemini([{ status: 429, body: "slow down" }]);
    err = undefined;
    await geminiModel("K", "m", limited.impl).step("s", [{ role: "user", text: "hi" }], TOOLS).catch((e) => (err = e));
    check("HTTP 429 is retried once, then reported", limited.calls.length === 2 && err instanceof ModelError && err.status === 429, limited.calls.length);
  }

  console.log("\nSearch by meaning (fake embeddings server)");
  {
    // Fake vectors: one axis for "noise", one for "waste", one for everything else.
    const vec = (text: string) => {
      const t = text.toLowerCase();
      return [/(zhurm|noise)/.test(t) ? 1 : 0, /(mbetur|waste)/.test(t) ? 1 : 0, 0.05];
    };
    const requests: Obj[] = [];
    const impl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { requests: { model: string; content: { parts: { text: string }[] } }[] };
      requests.push(...body.requests);
      return new Response(JSON.stringify({ embeddings: body.requests.map((r) => ({ values: vec(r.content.parts[0].text) })) }), { status: 200 });
    }) as unknown as typeof fetch;
    const embed = geminiEmbedder("K", "gemini-embedding-2", impl);
    const out = (await tool("search_requests").run({ text: "zhurmë", limit: 3 }, freshCtx(embed))) as { method: string; requests: { description: string; similarity: number }[] };
    check("uses semantic search when embeddings work", out.method === "semantic", out.method);
    const noise = data.records.filter((r) => /zhurm|noise/i.test(r.description ?? "")).length;
    const counted = (await tool("search_requests").run({ text: "zhurmë", limit: 3 }, freshCtx(embed))) as { totalMatches: number; searched: number };
    check("totalMatches counts only real matches, not everything searched", counted.totalMatches === noise && counted.searched === 48, counted);
    check("'zhurmë' finds both the Albanian and the English noise complaint first", out.requests.slice(0, 2).every((r) => /zhurm|noise/i.test(r.description ?? "")), out.requests);
    check("sends the newer model's task text and no taskType", requests.some((r) => String((r.content as { parts: { text: string }[] }).parts[0].text).startsWith("task: search result | query:")) && !requests.some((r) => "taskType" in r));
    check("never embeds a citizen name", !requests.some((r) => names.some((n) => JSON.stringify(r).includes(n))));
    const before = requests.length;
    await tool("search_requests").run({ text: "zhurmë", limit: 3 }, freshCtx(embed));
    check("the same search again embeds nothing new (all cached)", requests.length === before, requests.length - before);
    await tool("search_requests").run({ text: "mbeturina", limit: 3 }, freshCtx(embed));
    check("a different question embeds only the question, not the documents again", requests.length - before === 1, requests.length - before);

    const seen: string[] = [];
    const counting = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { requests: { content: { parts: { text: string }[] } }[] };
      seen.push(...body.requests.map((r) => r.content.parts[0].text));
      await new Promise((r) => setTimeout(r, 30));
      return new Response(JSON.stringify({ embeddings: body.requests.map(() => ({ values: [1, 0, 0] })) }), { status: 200 });
    }) as unknown as typeof fetch;
    const shared = geminiEmbedder("K", "gemini-embedding-dedupe", counting);
    const texts = Array.from({ length: 40 }, (_, i) => `text ${i}`);
    await Promise.all([shared(texts, "document"), shared(texts, "document"), shared(texts.slice(0, 10), "document")]);
    check("simultaneous searches embed each text only once", seen.length === 40, seen.length);

    const broken = geminiEmbedder("K", "gemini-embedding-x", (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch);
    const fallback = (await tool("search_requests").run({ text: "zhurmë" }, freshCtx(broken))) as { method: string; note: string; requests: { description: string }[] };
    check("falls back to keywords when embeddings fail", fallback.method === "keywords" && /unavailable/.test(fallback.note) && fallback.requests.length >= 1, fallback);
    const plain = (await tool("search_requests").run({ text: "noise" }, freshCtx())) as { method: string };
    check("uses keywords when no embeddings provider exists", plain.method === "keywords");
  }

  console.log("\nOffline model: the questions the page suggests");
  const ask = (q: string) => runAgent({ turns: [{ role: "user", text: q }], model: offlineModel, ctx: freshCtx() });
  const cited = (r: Awaited<ReturnType<typeof ask>>) => [...r.answer.matchAll(/\[(R\d+)(?:, (R\d+))*\]/g)].every((m) => r.citations.some((c) => c.ref === m[1]));
  {
    const r = await ask("Cila zonë kërkon më shumë vëmendje?");
    check("priority: names Zona 3 and uses two tools", r.answer.includes("Zona 3") && r.trace.map((t) => t.tool).join() === "city_overview,zone_summary", [r.answer, r.trace]);
    check("priority: its citation is a real request", r.citations.length >= 1 && cited(r));
  }
  {
    const r = await ask("Sa kërkesa të pazgjidhura ka Zona 3?");
    check("count: 3 unresolved in Zona 3", r.answer.includes("**3**") && r.trace[0].tool === "count_requests", r.answer);
  }
  check("count: 48 in total", (await ask("Sa kërkesa ka gjithsej?")).answer.includes("**48**"));
  {
    const r = await ask("Sa kërkesa ka çdo zonë?");
    check("count by zone lists all six zones", (r.answer.match(/- Zona \d/g) ?? []).length === 6, r.answer);
  }
  check("trend: peak month is Prill 2026", /Prill 2026/.test((await ask("Si ka ecur numri i kërkesave çdo muaj?")).answer));
  check("budget: Zona 5 has 2.5 mln L left", /2\.5 mln L/.test((await ask("Sa buxhet ka mbetur në Zona 5?")).answer));
  {
    const r = await ask("Nëse kemi 1.5 mln L këtë muaj, çfarë të rregullojmë së pari?");
    const args = r.trace[0]?.args as { budget_leke?: number } | undefined;
    check("plan: reads 1.5 mln L as 1,500,000", r.trace[0]?.tool === "build_work_plan" && args?.budget_leke === 1_500_000, r.trace[0]);
    check("plan: cites real requests", r.citations.length >= 1 && cited(r));
  }
  {
    const r = await ask("Ka ankesa për zhurmë?");
    check("search: finds the noise complaint and cites it", /zhurm/i.test(r.answer) && r.citations.length >= 1 && cited(r), r.answer);
  }
  check("search by category: waste", /mbeturina|waste/i.test((await ask("Trego ankesat për mbeturina")).answer));
  check("an unknown zone is explained, not crashed", /Nuk e kuptova/.test((await ask("Sa kërkesa ka Zona 99?")).answer));
  {
    const r = await ask("Përshëndetje");
    check("a greeting is answered warmly, with examples and no warning", r.trace.length === 0 && /Jam Busulla/.test(r.answer) && /Provo/.test(r.answer) && !r.notice && r.general === false, r);
    const g = await ask("Cili është vendi më i bukur në Elbasan?");
    check("a general question offline says it needs the model, instead of guessing", /GEMINI_API_KEY/.test(g.answer) && g.trace.length === 0, g.answer);
  }
  {
    const r = await ask("Cila zonë kërkon më shumë vëmendje?");
    check("the result names the zone and carries its insight (for the side panel)", r.focusZone === "area-3" && Boolean(r.insight?.headline) && r.insight?.zone === "Zona 3", [r.focusZone, r.insight]);
    const c = await ask("Sa kërkesa ka Zona 5?");
    check("a zone named in a count sets the focus zone too", c.focusZone === "area-5", c.focusZone);
  }
  check("intent: budget number is not confused with a zone number", parseIntent("Sa buxhet ka Zona 3?").budgetLeke === undefined);

  console.log("\nAPI route (no key set: offline mode)");
  const post = (body: unknown, client = "test-a") =>
    POST(new Request("http://x/api/agent", { method: "POST", headers: { "x-forwarded-for": client, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  {
    const status = (await (await GET()).json()) as { configured: boolean; model: string | null };
    check("GET reports not configured without a key", status.configured === false && status.model === null, status);
    const ok = await post({ messages: [{ role: "user", text: "Sa kërkesa ka gjithsej?" }] });
    const body = (await ok.json()) as { answer: string; mode: string; cached?: boolean };
    check("valid question -> 200 with an answer in offline mode", ok.status === 200 && body.mode === "offline" && body.answer.includes("48"), body);
    const again = (await (await post({ messages: [{ role: "user", text: "sa kërkesa ka gjithsej?" }] })).json()) as { cached?: boolean };
    check("the same first question is served from the cache", again.cached === true);
    check("bad JSON -> 400", (await post("{oops")).status === 400);
    check("no messages -> 400", (await post({ messages: [] })).status === 400);
    check("wrong role -> 400", (await post({ messages: [{ role: "system", text: "x" }] })).status === 400);
    check("last message from the assistant -> 400", (await post({ messages: [{ role: "assistant", text: "x" }] })).status === 400);
    check("a huge question -> 400", (await post({ messages: [{ role: "user", text: "a".repeat(900) }] })).status === 400);
    const followUp = await post({ messages: [{ role: "user", text: "Cila zonë kërkon vëmendje?" }, { role: "assistant", text: "Zona 3." }, { role: "user", text: "Sa kërkesa të pazgjidhura ka Zona 3?" }] });
    check("a follow-up in a conversation works", followUp.status === 200);
    let limited = 0;
    for (let i = 0; i < 25; i++) if ((await post({ messages: [{ role: "user", text: `pyetje ${i}` }] }, "flood")).status === 429) limited++;
    check("more than 20 questions a minute from one client -> 429", limited >= 4, limited);
  }

  console.log("\nPhotos");
  {
    const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const fake = fakeGemini([{ candidates: [{ content: { role: "model", parts: [{ text: "Shoh një gropë në rrugë." }] } }] }]);
    const r = await runAgent({
      turns: [{ role: "user", text: "Më herët pyeta diçka" }, { role: "assistant", text: "Në rregull." }, { role: "user", text: "Çfarë shihet në foto?" }],
      images: [{ mimeType: "image/png", data: PNG }],
      model: geminiModel("KEY", "m", fake.impl),
      ctx: freshCtx(),
    });
    const sent = fake.calls[0].body.contents as { role: string; parts: Obj[] }[];
    check("the photo goes to Gemini as inlineData, before the question", sent[2].parts[0].inlineData !== undefined && (sent[2].parts[0].inlineData as Obj).mimeType === "image/png" && sent[2].parts[1].text === "Çfarë shihet në foto?", sent[2]);
    check("older messages carry no photo", sent[0].parts.every((p) => p.inlineData === undefined));
    check("the answer about the photo comes back", r.answer.includes("gropë"), r.answer);
    check("the system prompt explains photos and forbids identifying people", /attach photos/.test(String((fake.calls[0].body.systemInstruction as { parts: { text: string }[] }).parts[0].text)) && /Do not identify people/.test(String((fake.calls[0].body.systemInstruction as { parts: { text: string }[] }).parts[0].text)));

    const offline = await runAgent({ turns: [{ role: "user", text: "Çfarë shihet?" }], images: [{ mimeType: "image/png", data: PNG }], model: offlineModel, ctx: freshCtx() });
    check("without a model, a photo gets an honest reply and no guessing", /Gemini/.test(offline.answer) && offline.trace.length === 0, offline.answer);

    const post = (body: unknown, client: string) =>
      POST(new Request("http://x/api/agent", { method: "POST", headers: { "x-forwarded-for": client, "content-type": "application/json" }, body: JSON.stringify(body) }));
    const q = [{ role: "user", text: "Çfarë shihet në foto?" }];
    const good = await post({ messages: q, images: [{ mimeType: "image/png", data: PNG }] }, "photo-a");
    const goodBody = (await good.json()) as { mode: string; answer: string };
    check("a valid photo is accepted by the route", good.status === 200 && goodBody.mode === "offline" && /Gemini/.test(goodBody.answer), goodBody);
    const again = (await (await post({ messages: q, images: [{ mimeType: "image/png", data: PNG }] }, "photo-a")).json()) as { cached?: boolean };
    check("a question with a photo is never served from the cache", again.cached !== true);
    check("an unsupported photo type is refused", (await post({ messages: q, images: [{ mimeType: "image/gif", data: PNG }] }, "photo-b")).status === 400);
    check("data that is not base64 is refused", (await post({ messages: q, images: [{ mimeType: "image/png", data: "not base64!!" }] }, "photo-b")).status === 400);
    check("more than 3 photos are refused", (await post({ messages: q, images: Array(4).fill({ mimeType: "image/png", data: PNG }) }, "photo-b")).status === 400);
    check("an oversized photo is refused", (await post({ messages: q, images: [{ mimeType: "image/jpeg", data: "A".repeat(2_600_000) }] }, "photo-b")).status === 400);
    check("photos that are not a list are refused", (await post({ messages: q, images: "x" }, "photo-b")).status === 400);
  }

  console.log("\nVoice input (the parts that don't need a microphone)");
  {
    const event = { results: { length: 2, 0: { length: 1, isFinal: true, 0: { transcript: "sa kërkesa" } }, 1: { length: 1, isFinal: false, 0: { transcript: "ka zona tre" } } } } as unknown as SpeechEvent;
    check("all heard parts, final and interim, are joined into one line", transcriptOf(event) === "sa kërkesa ka zona tre", transcriptOf(event));
    check("spoken words go after what was already typed", joinSpoken("Përshëndetje ", "sa kërkesa") === "Përshëndetje sa kërkesa");
    check("nothing typed: only the spoken words", joinSpoken("", "sa kërkesa") === "sa kërkesa");
    check("stopping it yourself is not an error", speechErrorMessage("aborted") === null);
    check("a refused microphone gets a clear sentence", /mikrofonin/.test(speechErrorMessage("not-allowed") ?? ""));
    check("an unknown failure still gets a sentence", Boolean(speechErrorMessage("something-new")));
    const cases: [string, string][] = [
      ["cila zonë kërkon më shumë vëmendje", "Cila zonë kërkon më shumë vëmendje?"],
      ["sa kërkesa të pazgjidhura ka zona 3", "Sa kërkesa të pazgjidhura ka zona 3?"],
      ["në cilën zonë ka më shumë ankesa", "Në cilën zonë ka më shumë ankesa?"],
      ["ka ankesa për zhurmë", "Ka ankesa për zhurmë?"],
      ["a ka ankesa për mbeturina", "A ka ankesa për mbeturina?"],
      ["si ka ecur numri i kërkesave", "Si ka ecur numri i kërkesave?"],
      ["mund të më tregosh buxhetin", "Mund të më tregosh buxhetin?"],
      ["trego ankesat për mbeturina", "Trego ankesat për mbeturina."],
      ["më trego shkurt historinë e elbasanit", "Më trego shkurt historinë e elbasanit."],
      ["trego sa kërkesa ka zona 3", "Trego sa kërkesa ka zona 3."],
      ["zona 3 ka shumë kërkesa të hapura", "Zona 3 ka shumë kërkesa të hapura."],
      ["sa kërkesa ka zona 3 pikëpyetje", "Sa kërkesa ka zona 3?"],
      ["ka ankesa për zhurmë presje dhe për mbeturina", "Ka ankesa për zhurmë, dhe për mbeturina?"],
      ["Përshëndetje!", "Përshëndetje!"],
      ["  sa   kërkesa ka  ", "Sa kërkesa ka?"],
    ];
    for (const [heard, want] of cases) check(`dictation "${heard}" -> "${want}"`, formatSpoken(heard) === want, formatSpoken(heard));
    check("words that continue an unfinished sentence keep a lowercase start", formatSpoken("dhe sa kërkesa ka", true) === "dhe sa kërkesa ka?", formatSpoken("dhe sa kërkesa ka", true));
    check("nothing heard gives nothing", formatSpoken("   ") === "");
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
