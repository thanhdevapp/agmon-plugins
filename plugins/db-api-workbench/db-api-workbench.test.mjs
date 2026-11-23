import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildExportCollection,
  filterSqlRows,
  formatMaybeJson,
  parseColumnFilter,
  rowsToCsv,
} from "./main.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("db-api-workbench uses zero innerHTML in main.js", () => {
  const src = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  assert.equal(/\binnerHTML\b|\bouterHTML\b/.test(src), false);
});

test("db-api-workbench formats JSON, filters SQL rows, and exports CSV/collections safely", () => {
  assert.match(formatMaybeJson('{"ok":true}'), /"ok": true/);
  assert.equal(formatMaybeJson("plain text"), "plain text");
  const out = buildExportCollection([
    { mode: "sql", name: "Active", body: "SELECT * FROM sessions;" },
    { mode: "http", name: "Health", body: "{}" },
  ]);
  assert.match(out, /### \[SQL\] Active/);
  assert.match(out, /### \[HTTP\] Health/);

  assert.deepEqual(parseColumnFilter("null"), { op: "null" });
  assert.equal(parseColumnFilter(">=100").num, 100);
  const rows = [
    ["a1", 50, "ok"],
    ["a2", 200, null],
    ["a3", 120, "warn"],
  ];
  assert.equal(filterSqlRows(rows, ">=100").length, 2);
  assert.equal(filterSqlRows(rows, "null").length, 1);
  assert.equal(filterSqlRows(rows, "warn").length, 1);
  assert.match(rowsToCsv(["id", "val"], [["a,1", 42]]), /"a,1",42/);
});
