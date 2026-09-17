import { DEFAULT_OPTIONS } from "./gate.js";
import type { Chunk, GateRequest } from "./types.js";

const MAX_CHUNKS = 100;
const MAX_QUERY_CHARS = 16_000;
const MAX_CHUNK_CHARS = 32_000;
const MAX_ID_CHARS = 256;

export type ParseResult =
  | { ok: true; value: GateRequest }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseChunk(value: unknown, index: number): Chunk | string {
  if (!isRecord(value)) {
    return `chunks[${index}] must be an object with id and text`;
  }
  if (typeof value.id !== "string" || value.id.trim() === "") {
    return `chunks[${index}].id must be a non-empty string`;
  }
  if (value.id.length > MAX_ID_CHARS) {
    return `chunks[${index}].id must be at most ${MAX_ID_CHARS} characters`;
  }
  if (typeof value.text !== "string") {
    return `chunks[${index}].text must be a string`;
  }
  if (value.text.length > MAX_CHUNK_CHARS) {
    return `chunks[${index}].text must be at most ${MAX_CHUNK_CHARS} characters`;
  }
  return { id: value.id, text: value.text };
}

function parseBound(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number | string {
  if (!isFiniteNumber(value)) {
    return `options.${name} must be a number`;
  }
  if (value < min || value > max) {
    return `options.${name} must be between ${min} and ${max}`;
  }
  return value;
}

export function parseGateRequest(body: unknown): ParseResult {
  if (!isRecord(body)) {
    return { ok: false, message: "Body must be a JSON object" };
  }

  if (typeof body.query !== "string" || body.query.trim() === "") {
    return { ok: false, message: "query must be a non-empty string" };
  }
  if (body.query.length > MAX_QUERY_CHARS) {
    return { ok: false, message: `query must be at most ${MAX_QUERY_CHARS} characters` };
  }

  if (!Array.isArray(body.chunks)) {
    return { ok: false, message: "chunks must be an array" };
  }
  if (body.chunks.length > MAX_CHUNKS) {
    return { ok: false, message: `chunks must contain at most ${MAX_CHUNKS} items` };
  }

  const chunks: Chunk[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of body.chunks.entries()) {
    const parsed = parseChunk(raw, index);
    if (typeof parsed === "string") {
      return { ok: false, message: parsed };
    }
    if (seen.has(parsed.id)) {
      return { ok: false, message: `duplicate chunk id: ${parsed.id}` };
    }
    seen.add(parsed.id);
    chunks.push(parsed);
  }

  let options: GateRequest["options"];
  if (body.options !== undefined) {
    if (!isRecord(body.options)) {
      return { ok: false, message: "options must be an object" };
    }

    const next: NonNullable<GateRequest["options"]> = {};

    if (body.options.topK !== undefined) {
      if (!Number.isInteger(body.options.topK)) {
        return { ok: false, message: "options.topK must be an integer" };
      }
      const topK = parseBound(body.options.topK, "topK", 1, MAX_CHUNKS);
      if (typeof topK === "string") {
        return { ok: false, message: topK };
      }
      next.topK = topK;
    }

    if (body.options.minRelevance !== undefined) {
      const minRelevance = parseBound(body.options.minRelevance, "minRelevance", 0, 1);
      if (typeof minRelevance === "string") {
        return { ok: false, message: minRelevance };
      }
      next.minRelevance = minRelevance;
    }

    if (body.options.injectionMax !== undefined) {
      const injectionMax = parseBound(body.options.injectionMax, "injectionMax", 0, 1);
      if (typeof injectionMax === "string") {
        return { ok: false, message: injectionMax };
      }
      next.injectionMax = injectionMax;
    }

    if (body.options.dropInjection !== undefined) {
      if (typeof body.options.dropInjection !== "boolean") {
        return { ok: false, message: "options.dropInjection must be a boolean" };
      }
      next.dropInjection = body.options.dropInjection;
    }

    if (body.options.minConfidence !== undefined) {
      const minConfidence = parseBound(
        body.options.minConfidence,
        "minConfidence",
        0,
        1,
      );
      if (typeof minConfidence === "string") {
        return { ok: false, message: minConfidence };
      }
      next.minConfidence = minConfidence;
    }

    options = next;
  }

  return {
    ok: true,
    value: {
      query: body.query,
      chunks,
      ...(options ? { options } : {}),
    },
  };
}

export { DEFAULT_OPTIONS, MAX_CHUNKS };
