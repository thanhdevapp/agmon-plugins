import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDiagramSource, serializeDiagramSource, snap } from "./main.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));

test("diagram-studio uses zero innerHTML in main.js (git-log craft standard)", () => {
  const src = fs.readFileSync(path.join(DIR, "main.js"), "utf8");
  assert.equal(src.includes("innerHTML"), false);
});

test("diagram-studio parses Mermaid flowcharts with shapes and edges and round-trips", () => {
  const mmd = `flowchart LR\n  A[Client] --> B{Firewall}\n  B -->|allow| C[(SQLite DB)]\n`;
  const parsed = parseDiagramSource(mmd);
  assert.equal(parsed.format, "mermaid");
  assert.equal(parsed.nodes.length, 3);
  assert.equal(parsed.nodes[1].shape, "diamond");
  assert.equal(parsed.nodes[2].shape, "database");
  assert.equal(parsed.edges.length, 2);
  assert.equal(parsed.edges[1].label, "allow");

  const serialized = serializeDiagramSource("mermaid", parsed.nodes, parsed.edges);
  assert.match(serialized, /A\[Client\] --> B\{Firewall\}/);
  assert.match(serialized, /\|allow\| C\[\(SQLite DB\)\]/);
  assert.equal(snap(44), 40);
  assert.equal(snap(46), 50);
});
