# RAG Gatekeeper — build brief (v0)

Standalone TypeSafe product. Score and filter RAG chunks before they hit your LLM: keep what’s relevant, drop junk and injection.

## One-liner

Score and filter RAG chunks before they hit your LLM: keep what’s relevant, drop junk and injection.

## API surface

`POST /v1/gate`

Request:

```json
{
  "query": "How do I set the MIG voltage for 1/8 plate?",
  "chunks": [
    { "id": "c1", "text": "..." },
    { "id": "c2", "text": "..." }
  ],
  "options": {
    "topK": 8,
    "minRelevance": 0.55,
    "minConfidence": 0.5,
    "dropInjection": true,
    "injectionMax": 0.7
  }
}
```

`minConfidence` is accepted for forward compatibility. TypeSafe noul answers have no separate confidence field, so v0 does not enforce it.

Response:

```json
{
  "kept": [
    { "id": "c1", "text": "...", "relevance": 0.91, "injection": 0.02 }
  ],
  "dropped": [
    { "id": "c2", "reason": "low_relevance", "relevance": 0.12, "injection": 0.05 }
  ],
  "usage": { "typesafeCalls": 2, "inputTokens": 1200, "outputTokens": 40 }
}
```

Drop reasons: `injection`, `low_relevance`, `over_top_k`.

Also: `GET /health`

Auth: `Authorization: Bearer <RAG_GATE_API_KEY>`. The server holds `TYPESAFE_API_KEY` separately and never returns it.

## TypeSafe questions (per chunk)

One `systemOne` call per chunk. Helpers: `noul`, `choice`, `score`. This product uses two nouls:

| Key | Type | Purpose |
|-----|------|---------|
| `relevant` | noul | Does this chunk help answer the query? → primary sort + drop below `minRelevance` |
| `injection` | noul | Prompt injection / instruction override? → drop if ≥ `injectionMax` when `dropInjection` is true |

Sort by `answers.relevant.noul` descending. Usage is summed from `result.usage.input_tokens` / `output_tokens`. Model is the SDK default — do not invent model ids.

Cookbook starting point: [Classifying RAG passages](https://docs.typesafe.ai/cookbooks/classifying_rag_passages.md).

Optional later: `contradicts` noul (conflicts with other kept chunks).

## First thresholds

| Knob | Default | Notes |
|------|---------|-------|
| `topK` | 8 | Max chunks returned after sort |
| `minRelevance` | 0.55 | Drop if noul relevance is below this |
| `dropInjection` | true | Drop if injection noul ≥ `injectionMax` |
| `injectionMax` | 0.7 | From the TypeSafe RAG classification cookbook starting point |
| concurrency | 8 | Parallel TypeSafe calls |

Tune with a labeled set of query/chunk pairs before locking for customers.

## Pricing sketch (your SaaS)

Bill by **chunks scored**. Starter menu (tune after real token averages): Free 500 / mo, Starter $29 / 10k, Pro $99 / 100k, overage ~$0.002 / chunk.

## Stack

- Node 20 + TypeScript
- Hono
- `@typesafe-ai/sdk` ^0.6
- Mock mode (`MOCK_TYPESAFE=1`) for demos without a key

## Out of scope for v0

- Embedding / BM25 retrieval (client already retrieved)
- Multi-tenant dashboard
- Streaming

## Success for MVP

1. `npm test` with mocked TypeSafe
2. `MOCK_TYPESAFE=1 npm run demo` prints kept/dropped
3. Live path when `TYPESAFE_API_KEY` is set
4. README + `.env.example` + curl
