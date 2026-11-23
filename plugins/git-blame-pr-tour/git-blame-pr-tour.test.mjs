import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTourOrder, categorizeChangedFiles, computeHeatColor } from "./main.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("git-blame-pr-tour uses zero innerHTML in main.js", () => {
  const src = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  assert.equal(/\binnerHTML\b|\bouterHTML\b/.test(src), false);
});

test("git-blame-pr-tour categorizes 8 PR kinds, excludes generated, orders tour stops, and flags risks", () => {
  const buckets = categorizeChangedFiles([
    { path: "src/lib/plugins/pluginRpcContract.ts", status: "M", additions: 14, deletions: 2 },
    { path: "src/app/api/plugins/route.ts", status: "M", additions: 20, deletions: 4 },
    { path: "src/lib/plugins/pluginEcosystemAllPhases.test.ts", status: "M", additions: 30, deletions: 0 },
    { path: "market/plugins/diagram-studio/main.js", status: "M", additions: 80, deletions: 10 },
    { path: "docs/feature-catalog.md", status: "M", additions: 5, deletions: 1 },
    { path: "market/releases.lock.json", status: "M", additions: 120, deletions: 120 },
  ]);
  assert.equal(buckets.Contracts.length, 1);
  assert.equal(buckets.Runtime.length, 1);
  assert.equal(buckets.Runtime[0].sensitive, true);
  assert.equal(buckets.Tests.length, 1);
  assert.equal(buckets.Plugins.length, 1);
  assert.equal(buckets.Docs.length, 1);
  assert.equal(buckets.Generated.length, 1);

  const stops = buildTourOrder(buckets);
  assert.equal(stops.length, 5);
  assert.equal(stops[0].kind, "Contracts");
  assert.equal(stops[stops.length - 1].kind, "Docs");

  assert.equal(computeHeatColor(1000, 1000), "#38bdf8");
  assert.equal(computeHeatColor(1000, 1000 + 86400 * 300), "#334155");
});
