import { describe, expect, it } from "vitest";
import { parseGateRequest } from "../src/validate.js";

describe("parseGateRequest", () => {
  it("accepts a minimal valid body", () => {
    const parsed = parseGateRequest({
      query: "How do I set voltage?",
      chunks: [{ id: "c1", text: "18V" }],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.chunks).toHaveLength(1);
      expect(parsed.value.options).toBeUndefined();
    }
  });

  it("rejects duplicate chunk ids", () => {
    const parsed = parseGateRequest({
      query: "q",
      chunks: [
        { id: "c1", text: "a" },
        { id: "c1", text: "b" },
      ],
    });
    expect(parsed).toEqual({ ok: false, message: "duplicate chunk id: c1" });
  });

  it("rejects out-of-range options", () => {
    const parsed = parseGateRequest({
      query: "q",
      chunks: [],
      options: { minRelevance: 1.2 },
    });
    expect(parsed.ok).toBe(false);
  });

  it("keeps minConfidence for forward compatibility", () => {
    const parsed = parseGateRequest({
      query: "q",
      chunks: [],
      options: { minConfidence: 0.5 },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.options?.minConfidence).toBe(0.5);
    }
  });
});
