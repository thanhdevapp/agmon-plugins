import { createIcon } from "./icons.js";

export function redactSecrets(raw) {
  let text = String(raw || "");
  let count = 0;
  const rules = [
    [/-----BEGIN [A-Z0-9 ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]+ PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
    [/\b(?:sk-[a-zA-Z0-9_-]{16,}|sk-ant-[a-zA-Z0-9_-]{16,})\b/g, "[REDACTED_API_KEY]"],
    [/\b(?:ghp|gho|ghu|ghs|github_pat)_[a-zA-Z0-9_]{16,}\b/g, "[REDACTED_GH_TOKEN]"],
    [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]"],
    [/\bBearer\s+eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "Bearer [REDACTED_JWT]"],
    [/\b(?:postgres|mysql|mongodb|redis)(?:\+\w+)?:\/\/[^\s"'`]+/gi, "[REDACTED_DB_URL]"],
  ];
  for (const [re, replacement] of rules) {
    text = text.replace(re, () => {
      count += 1;
      return replacement;
    });
  }
  return { redacted: text, count };
}

export function estimateLlmTokens(raw) {
  const text = String(raw || "");
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text ? text.split(/\r?\n/).length : 0;
  // Standard BPE heuristic (~3.8 chars/token for code/English mix)
  const tokens = chars === 0 ? 0 : Math.ceil(chars / 3.8);
  return {
    chars,
    words,
    lines,
    tokens,
    estCostUsd: {
      claudeSonnet: Number(((tokens / 1_000_000) * 3.0).toFixed(5)),
      claudeOpus: Number(((tokens / 1_000_000) * 15.0).toFixed(5)),
      gpt4o: Number(((tokens / 1_000_000) * 2.5).toFixed(5)),
      geminiPro: Number(((tokens / 1_000_000) * 1.25).toFixed(5)),
    },
  };
}

export function stripAnsiCodes(raw) {
  return String(raw || "")
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "");
}

export function explainCron(expr) {
  const parts = String(expr || "").trim().split(/\s+/);
  if (parts.length !== 5) return "Expected standard 5-field cron: <min> <hour> <dom> <mon> <dow>";
  const [min, hr, dom, mon, dow] = parts;
  return [
    `Expression : ${parts.join(" ")}`,
    `Minute     : ${min === "*" ? "every minute" : min.startsWith("*/") ? `every ${min.slice(2)} minutes` : `at minute ${min}`}`,
    `Hour       : ${hr === "*" ? "every hour" : hr.startsWith("*/") ? `every ${hr.slice(2)} hours` : `at hour ${hr}`}`,
    `Day/Month  : ${dom === "*" ? "every day" : `day ${dom}`} of ${mon === "*" ? "every month" : `month ${mon}`}`,
    `Day/Week   : ${dow === "*" ? "every weekday" : `weekday ${dow}`}`,
  ].join("\n");
}

export function diffJsonObjects(a, b, prefix = "$") {
  const diffs = [];
  if (a === b) return diffs;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) {
    diffs.push(`~ ${prefix}: ${JSON.stringify(a)}  ->  ${JSON.stringify(b)}`);
    return diffs;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const nextPath = Array.isArray(a) ? `${prefix}[${k}]` : `${prefix}.${k}`;
    if (!(k in a)) diffs.push(`+ ${nextPath}: ${JSON.stringify(b[k])}`);
    else if (!(k in b)) diffs.push(`- ${nextPath}: ${JSON.stringify(a[k])}`);
    else diffs.push(...diffJsonObjects(a[k], b[k], nextPath));
  }
  return diffs;
}

export function computeChmod(raw) {
  const clean = String(raw || "755").trim().replace(/^0o?/i, "");
  if (!/^[0-7]{3}$/.test(clean)) return "Enter 3 octal digits (e.g. 755 or 600)";
  const map = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
  const [u, g, o] = clean.split("").map(Number);
  return `Octal    : 0${clean}\nSymbolic : ${map[u]}${map[g]}${map[o]}\nOwner    : ${map[u]}\nGroup    : ${map[g]}\nOthers   : ${map[o]}`;
}

export function computeCidr(raw) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(String(raw || "10.0.1.0/24").trim());
  if (!m) return "Enter IPv4 CIDR (e.g. 10.0.1.0/24)";
  const octets = m.slice(1, 5).map(Number);
  const prefix = Number(m[5]);
  if (octets.some((x) => x > 255) || prefix > 32) return "Invalid IPv4 address or prefix";
  const ip = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const fmt = (n) => `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
  const hosts = prefix >= 31 ? Math.pow(2, 32 - prefix) : Math.max(0, Math.pow(2, 32 - prefix) - 2);
  return `CIDR      : ${fmt(network)}/${prefix}\nNetmask   : ${fmt(mask)}\nNetwork   : ${fmt(network)}\nBroadcast : ${fmt(broadcast)}\nUsable    : ${hosts.toLocaleString()} hosts`;
}

export function wcagContrast(fgHex, bgHex) {
  const parse = (h) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(h || "").trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const l1 = parse(fgHex);
  const l2 = parse(bgHex);
  if (l1 === null || l2 === null) return null;
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function createBridge() {
  let seq = 1;
  const pending = new Map();
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0") return;
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      clearTimeout(timer);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || "RPC error"));
      else resolve(msg.result);
      return;
    }
    if (msg.method === "theme:variables") {
      for (const [k, v] of Object.entries(msg.params?.variables || {})) {
        if (k.startsWith("--")) document.documentElement.style.setProperty(k, String(v));
      }
    }
  });
  function call(method, params = {}, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const id = `tb-${Date.now()}-${seq++}`;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC timeout: ${method}`)); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
    });
  }
  return { call };
}

if (typeof document !== "undefined" && document.getElementById("toolSel")) {
  const $ = (id) => document.getElementById(id);
  const toolSel = $("toolSel");
  const inA = $("inA");
  const inB = $("inB");
  const out = $("out");
  const swatchBar = $("swatchBar");

  $("btnRun").replaceChildren(createIcon("play", 13), document.createTextNode("Run"));

  // Populate left sidebar shortcuts synced with <select>
  const side = $("toolList");
  const syncSide = () => {
    side.querySelectorAll(".tool-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.tool === toolSel.value);
    });
  };
  [...toolSel.options].forEach((opt) => {
    const b = document.createElement("button");
    b.className = "tool-item";
    b.dataset.tool = opt.value;
    b.textContent = opt.textContent;
    b.onclick = () => {
      toolSel.value = opt.value;
      syncSide();
      runTool();
    };
    side.appendChild(b);
  });
  toolSel.onchange = () => { syncSide(); runTool(); };
  syncSide();

  async function runTool() {
    const t = toolSel.value;
    const a = inA.value.trim();
    const b = inB.value.trim();
    swatchBar.hidden = true;
    try {
      if (t === "jwt") {
        const parts = a.split(".");
        if (parts.length < 2) throw new Error("Paste a JWT token (header.payload.signature)");
        const dec = (s) => JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/")));
        const payload = dec(parts[1]);
        const expNote = payload.exp ? `Expires: ${new Date(payload.exp * 1000).toISOString()}` : "No exp claim";
        out.textContent = `${expNote}\n\n${JSON.stringify({ header: dec(parts[0]), payload }, null, 2)}`;
      } else if (t === "secret-redact") {
        const res = redactSecrets(a || "OPENAI_API_KEY=sk-demo1234567890abcdef1234\nDB=postgres://admin:secret@localhost:5432/app");
        out.textContent = `Redacted ${res.count} secret(s):\n\n${res.redacted}`;
      } else if (t === "llm-tokens") {
        const est = estimateLlmTokens(a || "Explain how AGMon isolates plugins inside an opaque-origin iframe sandbox.");
        out.textContent = [
          `Estimated Tokens : ~${est.tokens.toLocaleString()} tokens`,
          `Characters       : ${est.chars.toLocaleString()}`,
          `Words / Lines    : ${est.words.toLocaleString()} words · ${est.lines.toLocaleString()} lines`,
          ``,
          `Estimated Input Cost (per call):`,
          `  Claude Sonnet ($3/1M)   : $${est.estCostUsd.claudeSonnet.toFixed(5)}`,
          `  Claude Opus   ($15/1M)  : $${est.estCostUsd.claudeOpus.toFixed(5)}`,
          `  GPT-4o        ($2.5/1M) : $${est.estCostUsd.gpt4o.toFixed(5)}`,
          `  Gemini Pro    ($1.25/1M): $${est.estCostUsd.geminiPro.toFixed(5)}`,
        ].join("\n");
      } else if (t === "ansi-clean") {
        const cleaned = stripAnsiCodes(a || "\u001b[32m[PASS]\u001b[0m \u001b[1mAll 38 plugins verified\u001b[0m");
        out.textContent = cleaned;
      } else if (t === "json") {
        out.textContent = JSON.stringify(JSON.parse(a || '{"ok":true}'), null, 2);
      } else if (t === "jsondiff") {
        const left = JSON.parse(a || '{"version":"1.0.0","plugins":31}');
        const right = JSON.parse(b || '{"version":"2.0.0","plugins":38,"verified":true}');
        const diffs = diffJsonObjects(left, right);
        out.textContent = diffs.length ? diffs.join("\n") : "No structural differences (objects are deeply equal).";
      } else if (t === "b64") {
        out.textContent = `Base64 Encoded:\n${btoa(unescape(encodeURIComponent(a)))}\n\nDecoded (if valid Base64):\n${(() => { try { return decodeURIComponent(escape(atob(a))); } catch { return "(input is plain text)"; } })()}`;
      } else if (t === "url") {
        const u = new URL(a.startsWith("http") ? a : `https://example.local/?${a.replace(/^\?/, "")}`);
        out.textContent = JSON.stringify({ origin: u.origin, pathname: u.pathname, params: Object.fromEntries(u.searchParams.entries()) }, null, 2);
      } else if (t === "regex") {
        const re = new RegExp(a || "\\b\\w+\\b", "g");
        const matches = [...(b || "").matchAll(re)].map((m) => ({ match: m[0], index: m.index, groups: m.slice(1) }));
        out.textContent = `Matches (${matches.length}):\n${JSON.stringify(matches, null, 2)}`;
      } else if (t === "hash") {
        const data = new TextEncoder().encode(a);
        const toHex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
        const [s256, s512] = await Promise.all([
          crypto.subtle.digest("SHA-256", data),
          crypto.subtle.digest("SHA-512", data),
        ]);
        out.textContent = `SHA-256:\n${toHex(s256)}\n\nSHA-512:\n${toHex(s512)}`;
      } else if (t === "uuid") {
        const uuids = Array.from({ length: 6 }, () => crypto.randomUUID());
        out.textContent = `UUID v4 Batch:\n${uuids.join("\n")}`;
      } else if (t === "cron") {
        out.textContent = explainCron(a || "*/15 * * * 1-5");
      } else if (t === "timestamp") {
        const num = Number(a || Math.floor(Date.now() / 1000));
        const ms = num > 1e12 ? num : num * 1000;
        const d = new Date(ms);
        out.textContent = `Epoch (s)  : ${Math.floor(ms / 1000)}\nEpoch (ms) : ${ms}\nUTC ISO    : ${d.toISOString()}\nLocal      : ${d.toString()}`;
      } else if (t === "docker") {
        const img = (a.split(/\s+/).pop() || "node:24-alpine");
        const ports = [...a.matchAll(/-p\s+([^\s]+)/g)].map((m) => `      - "${m[1]}"`).join("\n");
        const envs = [...a.matchAll(/-e\s+([^\s]+)/g)].map((m) => `      - ${m[1]}`).join("\n");
        out.textContent = `services:\n  app:\n    image: ${img}${ports ? `\n    ports:\n${ports}` : ""}${envs ? `\n    environment:\n${envs}` : ""}\n    restart: unless-stopped`;
      } else if (t === "contrast") {
        const fg = a || "#e6edf3";
        const bg = b || "#0d1117";
        const ratio = wcagContrast(fg, bg);
        if (!ratio) throw new Error("Provide 6-digit hex colors (e.g. #e6edf3 and #0d1117)");
        swatchBar.hidden = false;
        swatchBar.style.color = fg;
        swatchBar.style.background = bg;
        swatchBar.textContent = `Contrast ${ratio.toFixed(2)}:1 — AA ${ratio >= 4.5 ? "PASS" : "FAIL"} · AAA ${ratio >= 7 ? "PASS" : "FAIL"}`;
        out.textContent = `Foreground : ${fg}\nBackground : ${bg}\nRatio      : ${ratio.toFixed(2)}:1\nWCAG AA    : ${ratio >= 4.5 ? "PASS" : "FAIL"} (>= 4.5)\nWCAG AAA   : ${ratio >= 7 ? "PASS" : "FAIL"} (>= 7.0)`;
      } else if (t === "chmod") {
        out.textContent = computeChmod(a || "755");
      } else if (t === "cidr") {
        out.textContent = computeCidr(a || "10.0.1.0/24");
      }
    } catch (err) {
      out.textContent = `Error: ${err.message}`;
    }
  }

  $("btnRun").onclick = runTool;
  const bridge = createBridge();
  bridge.call("plugin:ready", {}).then(() => {
    bridge.call("theme:subscribe", {}).catch(() => {});
  });
}
