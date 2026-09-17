import type {
  Chunk,
  ChunkScore,
  DroppedChunk,
  GateOptions,
  GateRequest,
  GateResponse,
  GateUsage,
  KeptChunk,
  ScoreChunk,
} from "./types.js";

export const DEFAULT_OPTIONS: GateOptions = {
  topK: 8,
  minRelevance: 0.55,
  dropInjection: true,
  injectionMax: 0.7,
};

/** Parallel TypeSafe calls per request. */
export const DEFAULT_CONCURRENCY = 8;

export function resolveOptions(
  options?: GateRequest["options"],
): GateOptions {
  return {
    topK: options?.topK ?? DEFAULT_OPTIONS.topK,
    minRelevance: options?.minRelevance ?? DEFAULT_OPTIONS.minRelevance,
    dropInjection: options?.dropInjection ?? DEFAULT_OPTIONS.dropInjection,
    injectionMax: options?.injectionMax ?? DEFAULT_OPTIONS.injectionMax,
  };
}

export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await fn(items[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

function compareScored(
  a: { chunk: Chunk; score: ChunkScore },
  b: { chunk: Chunk; score: ChunkScore },
): number {
  const byRelevance = b.score.relevance - a.score.relevance;
  if (byRelevance !== 0) {
    return byRelevance;
  }
  return a.chunk.id.localeCompare(b.chunk.id);
}

/**
 * Score each chunk, sort by relevance descending, then drop injection,
 * low-relevance, and overflow past topK.
 */
export async function gate(
  request: GateRequest,
  scoreChunk: ScoreChunk,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<GateResponse> {
  const options = resolveOptions(request.options);

  const scored = await mapPool(request.chunks, concurrency, async (chunk) => {
    const score = await scoreChunk(request.query, chunk);
    return { chunk, score };
  });

  const usage = scored.reduce<GateUsage>(
    (acc, item) => ({
      typesafeCalls: acc.typesafeCalls + 1,
      inputTokens: acc.inputTokens + item.score.inputTokens,
      outputTokens: acc.outputTokens + item.score.outputTokens,
    }),
    { typesafeCalls: 0, inputTokens: 0, outputTokens: 0 },
  );

  const kept: KeptChunk[] = [];
  const dropped: DroppedChunk[] = [];

  for (const { chunk, score } of [...scored].sort(compareScored)) {
    if (options.dropInjection && score.injection >= options.injectionMax) {
      dropped.push({
        id: chunk.id,
        reason: "injection",
        relevance: score.relevance,
        injection: score.injection,
      });
      continue;
    }

    if (score.relevance < options.minRelevance) {
      dropped.push({
        id: chunk.id,
        reason: "low_relevance",
        relevance: score.relevance,
        injection: score.injection,
      });
      continue;
    }

    if (kept.length >= options.topK) {
      dropped.push({
        id: chunk.id,
        reason: "over_top_k",
        relevance: score.relevance,
        injection: score.injection,
      });
      continue;
    }

    kept.push({
      id: chunk.id,
      text: chunk.text,
      relevance: score.relevance,
      injection: score.injection,
    });
  }

  return { kept, dropped, usage };
}
