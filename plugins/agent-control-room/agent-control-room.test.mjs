import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computePitwallSummary, buildDagLayout } from "./main.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));

test("agent-control-room uses zero innerHTML in main.js", () => {
  const src = fs.readFileSync(path.join(DIR, "main.js"), "utf8");
  assert.equal(src.includes("innerHTML"), false);
});

test("agent-control-room computes pitwall summary and subagent DAG layout accurately", () => {
  const traces = [
    { connectionId: "a1", sessionTitle: "Arch", state: "busy", totalTokens: 120000, subagents: [{ id: "s1" }, { id: "s2" }] },
    { connectionId: "a2", sessionTitle: "Audit", state: "waiting", totalTokens: 45000, subagents: [] },
  ];
  const sum = computePitwallSummary(traces);
  assert.equal(sum.totalAgents, 2);
  assert.equal(sum.waitingCount, 1);
  assert.equal(sum.workingCount, 1);
  assert.equal(sum.totalTokens, 165000);
  assert.equal(sum.totalSubagents, 2);

  const dag = buildDagLayout(traces);
  assert.equal(dag.nodes.length, 4);
  assert.equal(dag.edges.length, 2);
});
