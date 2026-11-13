import test from "node:test";
import assert from "node:assert/strict";

import { resolveApiBase, readJsonResponse } from "./api";

test("resolveApiBase prefers the current origin on public domains", () => {
  assert.equal(
    resolveApiBase("http://localhost:4000", "softstream.taysirflow.duckdns.org", "https:"),
    "https://softstream.taysirflow.duckdns.org",
  );
  assert.equal(
    resolveApiBase("http://localhost:4000", "localhost", "http:"),
    "http://localhost:4000",
  );
});

test("readJsonResponse returns a friendly message for empty or non-json 404 responses", async () => {
  const response = new Response("404", { status: 404, headers: { "Content-Type": "text/plain" } });

  await assert.rejects(async () => readJsonResponse(response), /404|non-JSON/i);
});
