export type Chunk = {
  id: string;
  text: string;
};

export type GateOptions = {
  topK: number;
  minRelevance: number;
  dropInjection: boolean;
  injectionMax: number;
};

export type GateRequest = {
  query: string;
  chunks: Chunk[];
  options?: Partial<GateOptions> & {
    /** Accepted for forward compatibility. Noul has no separate confidence; unused in v0. */
    minConfidence?: number;
  };
};

export type ChunkScore = {
  relevance: number;
  injection: number;
  inputTokens: number;
  outputTokens: number;
};

export type ScoreChunk = (query: string, chunk: Chunk) => Promise<ChunkScore>;

export type KeptChunk = {
  id: string;
  text: string;
  relevance: number;
  injection: number;
};

export type DropReason = "low_relevance" | "injection" | "over_top_k";

export type DroppedChunk = {
  id: string;
  reason: DropReason;
  relevance: number;
  injection: number;
};

export type GateUsage = {
  typesafeCalls: number;
  inputTokens: number;
  outputTokens: number;
};

export type GateResponse = {
  kept: KeptChunk[];
  dropped: DroppedChunk[];
  usage: GateUsage;
};
