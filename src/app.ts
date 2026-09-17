import { Hono } from "hono";
import { authorize } from "./auth.js";
import { gate } from "./gate.js";
import type { ScoreChunk } from "./types.js";
import { parseGateRequest } from "./validate.js";

export type AppDeps = {
  scoreChunk: ScoreChunk;
  apiKey: string;
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, service: "rag-gate" }));

  app.post("/v1/gate", async (c) => {
    if (!authorize(c.req.header("authorization"), deps.apiKey)) {
      return c.json(
        {
          error: {
            code: "unauthorized",
            message: "Missing or invalid Authorization: Bearer token",
          },
        },
        401,
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: { code: "invalid_json", message: "Request body must be JSON" } },
        400,
      );
    }

    const parsed = parseGateRequest(body);
    if (!parsed.ok) {
      return c.json(
        { error: { code: "invalid_request", message: parsed.message } },
        400,
      );
    }

    try {
      const result = await gate(parsed.value, deps.scoreChunk);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scoring failed";
      return c.json({ error: { code: "score_failed", message } }, 502);
    }
  });

  return app;
}
