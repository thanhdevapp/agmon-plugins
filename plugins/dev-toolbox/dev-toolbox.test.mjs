import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeChmod,
  computeCidr,
  diffJsonObjects,
  estimateLlmTokens,
  explainCron,
  redactSecrets,
  stripAnsiCodes,
  wcagContrast,
} from "./main.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("dev-toolbox uses zero innerHTML in main.js", () => {
  const src = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  assert.equal(/\binnerHTML\b|\bouterHTML\b/.test(src), false);
});

test("dev-toolbox pure utilities compute cron, JSON diff, chmod, CIDR, WCAG, redaction, tokens, and ANSI", () => {
  assert.match(explainCron("*/15 * * * 1-5"), /every 15 minutes/);
  const diffs = diffJsonObjects({ a: 1, b: 2 }, { a: 1, b: 3, c: true });
  assert.equal(diffs.length, 2);
  assert.match(computeChmod("755"), /rwxr-xr-x/);
  assert.match(computeCidr("10.0.1.0/24"), /254 hosts/);
  const ratio = wcagContrast("#ffffff", "#0d1117");
  assert.ok(ratio > 15);

  const red = redactSecrets("KEY=sk-abcd1234567890efghij URL=postgres://u:p@127.0.0.1:5432/db");
  assert.equal(red.count, 2);
  assert.match(red.redacted, /\[REDACTED_API_KEY\]/);
  assert.match(red.redacted, /\[REDACTED_DB_URL\]/);

  const tok = estimateLlmTokens("AGMon Zero-Trust plugin sandbox architecture");
  assert.ok(tok.tokens >= 10 && tok.words === 5);

  assert.equal(stripAnsiCodes("\u001b[32mPASS\u001b[0m"), "PASS");
});
