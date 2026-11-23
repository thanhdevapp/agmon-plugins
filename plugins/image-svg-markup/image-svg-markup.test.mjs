import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addShape, removeShapeAt, renumberSteps, snapAngle45 } from "./main.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("image-svg-markup uses zero innerHTML in main.js", () => {
  const src = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  assert.equal(/\binnerHTML\b|\bouterHTML\b/.test(src), false);
});

test("image-svg-markup immutable scene renumbers steps on add/delete and snaps 45-deg arrows", () => {
  let shapes = [];
  shapes = addShape(shapes, { t: "step", c: "#f43f5e", x: 10, y: 10, n: 1 });
  shapes = addShape(shapes, { t: "box", c: "#38bdf8", x: 20, y: 20, w: 50, h: 40 });
  shapes = addShape(shapes, { t: "step", c: "#f43f5e", x: 90, y: 90, n: 99 });
  assert.deepEqual(shapes.filter((s) => s.t === "step").map((s) => s.n), [1, 2]);
  shapes = removeShapeAt(shapes, 0);
  assert.deepEqual(shapes.filter((s) => s.t === "step").map((s) => s.n), [1]);
  assert.equal(renumberSteps(shapes).length, 2);

  const snapped = snapAngle45(0, 0, 100, 12);
  assert.ok(Math.abs(snapped.y2) < 1e-6);
});
