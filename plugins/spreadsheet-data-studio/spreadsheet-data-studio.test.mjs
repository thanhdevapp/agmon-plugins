import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { colIndexToLetter, letterToColIndex, evaluateCellFormula } from "./main.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));

test("spreadsheet-data-studio uses zero innerHTML in main.js", () => {
  const src = fs.readFileSync(path.join(DIR, "main.js"), "utf8");
  assert.equal(src.includes("innerHTML"), false);
});

test("spreadsheet formula engine evaluates SUM, AVG, MIN, MAX, COUNT, MEDIAN, IF, and arithmetic", () => {
  assert.equal(colIndexToLetter(0), "A");
  assert.equal(colIndexToLetter(26), "AA");
  assert.equal(letterToColIndex("AA"), 26);

  const rows = [
    ["Item", "Qty", "Price", "Total"],
    ["Alpha", "2", "10", "=B2*C2"],
    ["Beta", "4", "15", "=B3*C3"],
    ["Gamma", "6", "20", "=B4*C4"],
  ];
  assert.equal(evaluateCellFormula("=B2*C2", rows), "20");
  assert.equal(evaluateCellFormula("=SUM(D2:D4)", rows), "200");
  assert.equal(evaluateCellFormula("=AVG(B2:B4)", rows), "4.00");
  assert.equal(evaluateCellFormula("=MIN(C2:C4)", rows), "10");
  assert.equal(evaluateCellFormula("=MAX(C2:C4)", rows), "20");
  assert.equal(evaluateCellFormula("=COUNT(B2:B4)", rows), "3");
  assert.equal(evaluateCellFormula("=MEDIAN(B2:B4)", rows), "4");
  assert.equal(evaluateCellFormula('=IF(B4>5, "Bulk", "Single")', rows), "Bulk");
  assert.equal(evaluateCellFormula("=B2/0", rows), "#DIV/0!");
});
