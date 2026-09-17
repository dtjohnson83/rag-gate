import { serve } from "@hono/node-server";
import { config } from "dotenv";
import { createApp } from "./app.js";
import { createScorerFromEnv } from "./scorer.js";

config();

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const apiKey = process.env.RAG_GATE_API_KEY?.trim() ?? "";

if (!apiKey) {
  console.error("RAG_GATE_API_KEY is required to start the HTTP server. See .env.example.");
  process.exit(1);
}

const scoreChunk = createScorerFromEnv();
const app = createApp({ scoreChunk, apiKey });

serve({ fetch: app.fetch, port }, (info) => {
  const mock = process.env.MOCK_TYPESAFE === "1";
  console.log(
    `rag-gate listening on http://127.0.0.1:${info.port} (${mock ? "MOCK_TYPESAFE" : "TypeSafe live"})`,
  );
});
