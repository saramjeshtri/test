# Data fusion engine

Reconciles fragmented municipal source files into the canonical schema
defined in [`schema.ts`](schema.ts). This is the generic *engine* -- the
actual "Merge" moment in the demo is running it live against the real Track D
data package once it's issued at the event, not this code existing in advance
(see the hackathon rule on the core solution being substantially developed
during the event; disclose this reusable engine + its use of pre-existing
libraries in Annex E).

## Pipeline

```
raw file --[parser]--> RawTable (headers + string rows)
              |
              v
      matchHeader() per column   -- deterministic: normalize + fuzzy match
              |                     against lib/fusion/dictionaries.ts
       unmatched headers?
              |
              v
  resolveUnmatchedHeaders()      -- LLM fallback (lib/fusion/llmFieldMatcher.ts)
              |                     only called for what's left unresolved
              v
      headerToField map
              |
              v
   per-row value normalization   -- lib/fusion/valueNormalizers.ts
   (zone/status/category/priority/date/cost)
              |
              v
      CanonicalRequest[]  +  per-source mapping report
```

Run it against the current fixtures:

```bash
npm run fusion:run          # parses fixtures/raw-sources/*, writes fixtures/canonical-output/*.json
npm run fusion:test-llm     # proves the LLM-fallback wiring works, via a mock provider (no API key needed)
```

## Before the event

- The deterministic dictionary (`dictionaries.ts`) currently covers 100% of
  our synthetic fixture headers, so `fusion:run` produces a fully-resolved
  dataset without needing any API key. The LLM fallback path is real and
  tested (`fusion:test-llm`), but only exercised there until genuinely novel
  headers show up.
- When the real Track D data package lands, extend `HEADER_ALIASES` /
  `STATUS_ALIASES` / `CATEGORY_ALIASES` / `PRIORITY_ALIASES` first -- it's
  free and instant. Only what's left unmatched should hit the LLM (budget is
  $25-50 total for the team, issued Friday).
- `llmFieldMatcher.ts` defaults to Claude (`anthropicProvider`); swap the
  `provider` argument if the event hands out OpenAI credits instead.
- `data_quality_flags` on each `CanonicalRequest` is what the Command
  Center's "Evidence" panel should surface -- it's already honest about what
  each source does and doesn't track, rather than silently defaulting values.
