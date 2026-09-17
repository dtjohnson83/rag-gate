# RAG Gatekeeper — build brief (v0)

Standalone TypeSafe product. Not DimeVision.

## One-liner
Score and filter RAG chunks before they hit your LLM: keep what’s relevant and high-confidence, drop junk and injection.

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
    "dropInjection": true
  }
}
```

Response:
```json
{
  "kept": [
    { "id": "c1", "text": "...", "relevance": 0.91, "confidence": 0.88, "injection": 0.02 }
  ],
  "dropped": [
    { "id": "c2", "reason": "low_relevance", "relevance": 0.12, "confidence": 0.7 }
  ],
  "usage": { "typesafeCalls": 2, "inputTokens": 1200, "outputTokens": 40 }
}
```

Also: `GET /health`

Auth: `Authorization: Bearer <RAG_GATE_API_KEY>` (your product key). Server holds `TYPESAFE_API_KEY` separately.

## TypeSafe questions (per chunk)

| Key | Type | Purpose |
|-----|------|---------|
| `relevant` | noul | Does this chunk help answer the query? → primary sort + drop below `minRelevance` |
| `injection` | noul | Prompt injection / instruction override? → drop if high and `dropInjection` |

Optional later: `contradicts` noul (conflicts with other kept chunks).

## First thresholds

| Knob | Default | Notes |
|------|---------|-------|
| `topK` | 8 | Max chunks returned after sort |
| `minRelevance` | 0.55 | Drop if noul relevance below |
| `minConfidence` | 0.5 | Soft gate; if SDK exposes confidence on noul, enforce; else document N/A for v0 |
| `dropInjection` | true | Drop if injection noul ≥ 0.7 |
| concurrency | 8 | Parallel TypeSafe calls |

Tune with a labeled set of query/chunk pairs before locking for customers.

## Pricing sketch (your SaaS)

Pass-through TypeSafe cost + margin. Starting menu (adjust after real token averages):

| Plan | Included gate calls / mo | Soft cap chunks/call | Price |
|------|--------------------------|----------------------|-------|
| Free | 500 | 20 | $0 |
| Starter | 10_000 | 40 | $29 |
| Pro | 100_000 | 80 | $99 |
| Usage | overage | — | ~$0.002 / chunk scored |

Bill by **chunks scored** (one TypeSafe call ≈ one chunk), not by HTTP requests. Show usage in response + dashboard later.

## Stack

- Node 20 + TypeScript
- Hono or Express
- `@typesafe-ai/sdk`
- Mock mode (`MOCK_TYPESAFE=1`) for demos without a key

## Out of scope for v0

- Embedding / BM25 retrieval (client already retrieved)
- Multi-tenant dashboard
- Streaming
- DimeVision wiring

## Success for MVP

1. `npm test` with mocked TypeSafe
2. Demo script prints kept/dropped
3. Live path when `TYPESAFE_API_KEY` set
4. README + `.env.example` + curl

## Repo status

Cloud agent `new_repo` blocked: Origin namespace not created yet.
Need either Origin at https://cursor.com/codebase/get-started or a new empty GitHub repo (e.g. `dtjohnson83/rag-gate`).
