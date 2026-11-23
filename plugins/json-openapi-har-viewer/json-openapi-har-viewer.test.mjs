import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripJsoncComments, detectDocumentMode, extractOpenApiEndpoints, extractHarWaterfall } from "./main.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));

test("json-openapi-har-viewer uses zero innerHTML in main.js", () => {
  const src = fs.readFileSync(path.join(DIR, "main.js"), "utf8");
  assert.equal(src.includes("innerHTML"), false);
});

test("json-openapi-har-viewer parses JSONC, OpenAPI endpoints, and HAR waterfalls", () => {
  const cleaned = stripJsoncComments(`{\n  // comment\n  "openapi": "3.1.0",\n  "paths": { "/health": { "get": { "summary": "OK" } } },\n}`);
  const doc = JSON.parse(cleaned);
  assert.equal(detectDocumentMode(doc), "openapi");
  const eps = extractOpenApiEndpoints(doc);
  assert.equal(eps.length, 1);
  assert.equal(eps[0].method, "GET");

  const har = {
    log: {
      entries: [
        { startedDateTime: "2026-11-23T10:00:00.000Z", time: 45, request: { method: "GET", url: "http://localhost/a" }, response: { status: 200, content: { size: 1200 } } },
        { startedDateTime: "2026-11-23T10:00:00.050Z", time: 110, request: { method: "POST", url: "http://localhost/b" }, response: { status: 201, content: { size: 800 } } },
      ],
    },
  };
  assert.equal(detectDocumentMode(har), "har");
  const wf = extractHarWaterfall(har);
  assert.equal(wf.entries.length, 2);
  assert.equal(wf.totalBytes, 2000);
  assert.equal(wf.totalMs, 160);
});
