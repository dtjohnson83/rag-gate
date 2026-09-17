import { describe, expect, it } from "vitest";
import { DEFAULT_CONCURRENCY, DEFAULT_OPTIONS, gate, mapPool } from "../src/gate.js";
import type { Chunk, ChunkScore, ScoreChunk } from "../src/types.js";

function scores(map: Record<string, Partial<ChunkScore>>): ScoreChunk {
  return async (_query, chunk) => {
    const row = map[chunk.id];
    if (!row) {
      throw new Error(`no mock score for ${chunk.id}`);
    }
    return {
      relevance: row.relevance ?? 0,
      injection: row.injection ?? 0,
      inputTokens: row.inputTokens ?? 10,
      outputTokens: row.outputTokens ?? 2,
    };
  };
}

function chunks(...ids: string[]): Chunk[] {
  return ids.map((id) => ({ id, text: `text for ${id}` }));
}

describe("gate", () => {
  it("sorts kept chunks by relevance descending", async () => {
    const result = await gate(
      {
        query: "MIG voltage",
        chunks: chunks("low", "high", "mid"),
      },
      scores({
        high: { relevance: 0.91, injection: 0.02 },
        mid: { relevance: 0.7, injection: 0.01 },
        low: { relevance: 0.6, injection: 0.03 },
      }),
    );

    expect(result.kept.map((chunk) => chunk.id)).toEqual(["high", "mid", "low"]);
    expect(result.dropped).toEqual([]);
  });

  it("breaks relevance ties by id", async () => {
    const result = await gate(
      {
        query: "q",
        chunks: chunks("b", "a"),
      },
      scores({
        a: { relevance: 0.8, injection: 0.01 },
        b: { relevance: 0.8, injection: 0.01 },
      }),
    );

    expect(result.kept.map((chunk) => chunk.id)).toEqual(["a", "b"]);
  });

  it("drops chunks below minRelevance", async () => {
    const result = await gate(
      {
        query: "q",
        chunks: chunks("keep", "junk"),
      },
      scores({
        keep: { relevance: 0.55, injection: 0.01 },
        junk: { relevance: 0.549, injection: 0.01 },
      }),
    );

    expect(result.kept.map((chunk) => chunk.id)).toEqual(["keep"]);
    expect(result.dropped).toEqual([
      {
        id: "junk",
        reason: "low_relevance",
        relevance: 0.549,
        injection: 0.01,
      },
    ]);
  });

  it("drops injection at or above injectionMax before relevance", async () => {
    const result = await gate(
      {
        query: "q",
        chunks: chunks("inject"),
      },
      scores({
        inject: { relevance: 0.99, injection: 0.7 },
      }),
    );

    expect(result.kept).toEqual([]);
    expect(result.dropped).toEqual([
      {
        id: "inject",
        reason: "injection",
        relevance: 0.99,
        injection: 0.7,
      },
    ]);
  });

  it("keeps injection when dropInjection is false", async () => {
    const result = await gate(
      {
        query: "q",
        chunks: chunks("inject"),
        options: { dropInjection: false },
      },
      scores({
        inject: { relevance: 0.99, injection: 0.99 },
      }),
    );

    expect(result.kept.map((chunk) => chunk.id)).toEqual(["inject"]);
    expect(result.dropped).toEqual([]);
  });

  it("applies topK after sort and filters", async () => {
    const result = await gate(
      {
        query: "q",
        chunks: chunks("a", "b", "c", "d"),
        options: { topK: 2 },
      },
      scores({
        a: { relevance: 0.9, injection: 0.01 },
        b: { relevance: 0.8, injection: 0.01 },
        c: { relevance: 0.7, injection: 0.01 },
        d: { relevance: 0.2, injection: 0.01 },
      }),
    );

    expect(result.kept.map((chunk) => chunk.id)).toEqual(["a", "b"]);
    expect(result.dropped.map((chunk) => chunk.reason)).toEqual([
      "over_top_k",
      "low_relevance",
    ]);
    expect(result.dropped.map((chunk) => chunk.id)).toEqual(["c", "d"]);
  });

  it("uses request option overrides", async () => {
    const result = await gate(
      {
        query: "q",
        chunks: chunks("weak"),
        options: { minRelevance: 0.2, injectionMax: 0.9 },
      },
      scores({
        weak: { relevance: 0.3, injection: 0.8 },
      }),
    );

    expect(result.kept.map((chunk) => chunk.id)).toEqual(["weak"]);
  });

  it("aggregates TypeSafe usage from each chunk score", async () => {
    const result = await gate(
      {
        query: "q",
        chunks: chunks("a", "b"),
      },
      scores({
        a: { relevance: 0.9, injection: 0.01, inputTokens: 100, outputTokens: 7 },
        b: { relevance: 0.1, injection: 0.01, inputTokens: 50, outputTokens: 3 },
      }),
    );

    expect(result.usage).toEqual({
      typesafeCalls: 2,
      inputTokens: 150,
      outputTokens: 10,
    });
  });

  it("returns empty kept/dropped for no chunks", async () => {
    const result = await gate(
      { query: "q", chunks: [] },
      scores({}),
    );

    expect(result).toEqual({
      kept: [],
      dropped: [],
      usage: { typesafeCalls: 0, inputTokens: 0, outputTokens: 0 },
    });
  });

  it("includes chunk text on kept items only", async () => {
    const result = await gate(
      {
        query: "q",
        chunks: [
          { id: "keep", text: "useful voltage table" },
          { id: "drop", text: "unrelated" },
        ],
      },
      scores({
        keep: { relevance: 0.9, injection: 0.01 },
        drop: { relevance: 0.1, injection: 0.01 },
      }),
    );

    expect(result.kept[0]).toMatchObject({
      id: "keep",
      text: "useful voltage table",
      relevance: 0.9,
      injection: 0.01,
    });
    expect(result.dropped[0]).not.toHaveProperty("text");
  });

  it("defaults match the brief", () => {
    expect(DEFAULT_OPTIONS).toEqual({
      topK: 8,
      minRelevance: 0.55,
      dropInjection: true,
      injectionMax: 0.7,
    });
    expect(DEFAULT_CONCURRENCY).toBe(8);
  });
});

describe("mapPool", () => {
  it("caps in-flight work at the requested concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const seen: number[] = [];

    const results = await mapPool([1, 2, 3, 4, 5], 2, async (value) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      seen.push(value);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight -= 1;
      return value * 10;
    });

    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(maxInFlight).toBe(2);
    expect(seen).toHaveLength(5);
  });
});
