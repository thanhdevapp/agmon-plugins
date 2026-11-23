import { createIcon } from "./icons.js";

const SENSITIVE_RISK_RE = /(auth|security|sandbox|route\.ts|pluginManager|vault|guard|permission|token|secret)/i;

/**
 * Classifies changed files into structured 8-kind PR review buckets + Generated
 * with security risk detection and reading-order tour priority.
 */
export function categorizeChangedFiles(files) {
  const buckets = {
    Contracts: [],
    Migrations: [],
    Runtime: [],
    Plugins: [],
    Tests: [],
    "CI/CD": [],
    Config: [],
    Dependencies: [],
    Docs: [],
    Generated: [],
  };
  for (const f of files || []) {
    const p = String(f.path || f.file || f || "");
    const item = {
      path: p,
      status: String(f.status || "M"),
      additions: Number(f.additions || 0),
      deletions: Number(f.deletions || 0),
      sensitive: SENSITIVE_RISK_RE.test(p),
    };
    if (/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|releases\.lock\.json|identities\.lock\.json|\.min\.js)$/i.test(p)) buckets.Generated.push(item);
    else if (/\.(test|spec)\.[a-z0-9]+$/i.test(p) || p.includes("__tests__")) buckets.Tests.push(item);
    else if (/(migration|schema\.sql|\.ddl$)/i.test(p)) buckets.Migrations.push(item);
    else if (/(contract|schema|types\.ts|\.d\.ts$|openapi)/i.test(p)) buckets.Contracts.push(item);
    else if (p.startsWith(".github/") || /dockerfile|workflow/i.test(p)) buckets["CI/CD"].push(item);
    else if (/(package\.json|Cargo\.toml|go\.mod|pyproject\.toml)$/i.test(p)) buckets.Dependencies.push(item);
    else if (p.startsWith("market/plugins/") || p.startsWith("plugins/")) buckets.Plugins.push(item);
    else if (p.startsWith("docs/") || p.startsWith("plans/") || p.endsWith(".md")) buckets.Docs.push(item);
    else if (p.startsWith("src/") || p.startsWith("electron/")) buckets.Runtime.push(item);
    else buckets.Config.push(item);
  }
  return buckets;
}

export function buildTourOrder(buckets) {
  const order = ["Contracts", "Migrations", "Runtime", "Plugins", "CI/CD", "Config", "Dependencies", "Tests", "Docs"];
  const stops = [];
  for (const kind of order) {
    for (const item of buckets[kind] || []) {
      stops.push({ ...item, kind });
    }
  }
  return stops;
}

/**
 * Computes age heatmap color (recent commits bright cyan -> older commits muted slate).
 */
export function computeHeatColor(authorTimeSec, nowSec = Math.floor(Date.now() / 1000)) {
  const ageDays = Math.max(0, (nowSec - Number(authorTimeSec || 0)) / 86400);
  if (ageDays <= 1) return "#38bdf8";
  if (ageDays <= 7) return "#0ea5e9";
  if (ageDays <= 30) return "#0284c7";
  if (ageDays <= 120) return "#1e40af";
  return "#334155";
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
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
      if (msg.error) {
        const err = new Error(msg.error.message || "RPC error");
        err.code = msg.error.data?.code || msg.error.code;
        reject(err);
      } else {
        resolve(msg.result);
      }
      return;
    }
    if (msg.method === "theme:variables") {
      for (const [k, v] of Object.entries(msg.params?.variables || {})) {
        if (k.startsWith("--")) document.documentElement.style.setProperty(k, String(v));
      }
    }
  });
  function call(method, params = {}, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const id = `blame-${Date.now()}-${seq++}`;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
    });
  }
  return { call };
}

if (typeof document !== "undefined" && document.getElementById("blameOut")) {
  const $ = (id) => document.getElementById(id);
  const setBtn = (id, icon, text) => {
    const b = $(id);
    b.replaceChildren(createIcon(icon, 13));
    if (text) b.appendChild(el("span", "", text));
  };
  setBtn("btnBlame", "search", "Blame");
  setBtn("btnPrev", "chevronLeft", "");
  setBtn("btnNext", "chevronRight", "");
  setBtn("btnTour", "refresh", "Tour");

  const bridge = createBridge();
  let startLine = 1;
  let totalLines = 0;
  let lastBlame = null;
  let blameGen = 0;
  let commitGen = 0;

  async function inspectCommit(hash) {
    const gen = ++commitGen;
    try {
      const res = await bridge.call("git:commit", { hash });
      if (gen !== commitGen) return;
      const commit = res.commit || {};
      const buckets = categorizeChangedFiles(commit.files || []);
      const frag = document.createDocumentFragment();

      const hdr = el("div", "group-block");
      const tourStops = buildTourOrder(buckets);
      hdr.append(
        el("div", "mono", `${String(commit.hash || hash).slice(0, 10)} · ${commit.author?.name || commit.author || ""}`),
        el("div", "", `${commit.subject || "(no subject)"} · ${tourStops.length} tour stops`)
      );
      // Proportional stacked share bar across non-generated change kinds
      const kindColors = {
        Contracts: "#a855f7",
        Migrations: "#f43f5e",
        Runtime: "#38bdf8",
        Plugins: "#10b981",
        Tests: "#f59e0b",
        "CI/CD": "#fb7185",
        Config: "#94a3b8",
        Dependencies: "#ec4899",
        Docs: "#64748b",
      };
      const totalFiles = Math.max(1, tourStops.length);
      const bar = el("div", "");
      bar.style.cssText = "display:flex;height:7px;border-radius:4px;overflow:hidden;margin-top:6px;background:rgba(148,163,184,0.16);";
      for (const [k, list] of Object.entries(buckets)) {
        if (k === "Generated" || !list.length) continue;
        const seg = el("div", "");
        seg.style.width = `${Math.max(4, Math.round((list.length / totalFiles) * 100))}%`;
        seg.style.background = kindColors[k] || "#64748b";
        seg.title = `${k}: ${list.length} file(s)`;
        bar.appendChild(seg);
      }
      hdr.appendChild(bar);
      frag.appendChild(hdr);

      for (const [bucketName, items] of Object.entries(buckets)) {
        if (!items.length) continue;
        const block = el("div", "group-block");
        const head = el("div", "group-head");
        head.append(el("span", "", `${bucketName} (${items.length})`));
        const sensCount = items.filter((i) => i.sensitive).length;
        if (sensCount > 0) head.appendChild(el("span", "badge risk", `${sensCount} sensitive`));
        block.appendChild(head);
        for (const f of items.slice(0, 18)) {
          const row = el("div", "file-row");
          const left = el("span", "", `${f.status} ${f.path}`);
          left.style.overflow = "hidden";
          left.style.textOverflow = "ellipsis";
          const right = el("span", "");
          if (f.sensitive) right.appendChild(el("span", "badge risk", "RISK "));
          if (f.additions) right.appendChild(el("span", "add", `+${f.additions} `));
          if (f.deletions) right.appendChild(el("span", "del", `-${f.deletions}`));
          row.append(left, right);
          block.appendChild(row);
        }
        frag.appendChild(block);
      }
      $("diffBreakdown").replaceChildren(frag);
      $("status").textContent = `Inspected commit ${String(hash).slice(0, 10)} (${(commit.files || []).length} files)`;
    } catch (err) {
      $("diffBreakdown").replaceChildren(el("div", "group-block", err.message));
    }
  }

  function renderBlameTable() {
    if (!lastBlame) return;
    const authorQ = $("authorFilter").value.trim().toLowerCase();
    const lines = (lastBlame.lines || []).filter(
      (l) => !authorQ || String(l.author || "").toLowerCase().includes(authorQ)
    );
    $("blameTitle").textContent = `Blame: ${lastBlame.file}`;
    $("blameStats").textContent = `${lines.length} / ${lastBlame.totalLines || lines.length} lines`;
    $("rangeLabel").textContent = `L${lastBlame.startLine}-${lastBlame.endLine}`;

    const tbl = el("table");
    const thead = el("thead");
    const hr = el("tr");
    for (const label of ["", "L", "Hash", "Author", "Code"]) hr.appendChild(el("th", "", label));
    thead.appendChild(hr);
    const tbody = el("tbody");
    const nowSec = Math.floor(Date.now() / 1000);

    for (const l of lines) {
      const tr = el("tr");
      const heat = el("td", "heat-cell");
      heat.style.background = computeHeatColor(l.authorTime, nowSec);
      heat.title = l.summary || "";
      const hashTd = el("td");
      const hashBtn = el("button", "hash-btn", l.hash);
      hashBtn.title = `${l.hash}: ${l.summary || ""}`;
      hashBtn.onclick = () => inspectCommit(l.hash);
      hashTd.appendChild(hashBtn);
      tr.append(
        heat,
        el("td", "mono", String(l.line)),
        hashTd,
        el("td", "", l.author),
        el("td", "code-cell", l.content)
      );
      tbody.appendChild(tr);
    }
    tbl.append(thead, tbody);
    $("blameOut").replaceChildren(tbl);
  }

  async function loadBlame() {
    const file = $("fileIn").value.trim();
    if (!file) return;
    const gen = ++blameGen;
    try {
      const res = await bridge.call("git:blame", { file, startLine, endLine: startLine + 99 });
      if (gen !== blameGen) return;
      lastBlame = res.blame;
      totalLines = Number(lastBlame?.totalLines || 0);
      renderBlameTable();
      $("status").textContent = `Blamed ${file} L${lastBlame.startLine}-${lastBlame.endLine}`;
    } catch (err) {
      $("blameOut").replaceChildren(el("div", "group-block", err.message));
      $("status").textContent = err.message;
    }
  }

  async function loadTour() {
    try {
      const res = await bridge.call("git:log", { limit: 25 });
      const commits = res.commits || [];
      $("tourStats").textContent = `${commits.length} commits`;
      const frag = document.createDocumentFragment();
      commits.forEach((c, idx) => {
        const btn = el("button", `commit-item${idx === 0 ? " active" : ""}`);
        const left = el("span", "mono", `${String(c.hash || "").slice(0, 7)} ${String(c.subject || "").slice(0, 44)}`);
        left.style.overflow = "hidden";
        left.style.textOverflow = "ellipsis";
        left.style.whiteSpace = "nowrap";
        const author = el("span", "badge", c.author?.name || (typeof c.author === "string" ? c.author : ""));
        btn.append(left, author);
        btn.onclick = () => {
          $("tourOut").querySelectorAll(".commit-item").forEach((x) => x.classList.remove("active"));
          btn.classList.add("active");
          inspectCommit(c.hash);
        };
        frag.appendChild(btn);
      });
      $("tourOut").replaceChildren(frag);
      if (commits[0]?.hash) await inspectCommit(commits[0].hash);
    } catch (err) {
      $("tourOut").replaceChildren(el("div", "group-block", err.message));
    }
  }

  $("btnBlame").onclick = () => { startLine = 1; loadBlame(); };
  $("btnPrev").onclick = () => { startLine = Math.max(1, startLine - 100); loadBlame(); };
  $("btnNext").onclick = () => { if (!totalLines || startLine + 100 <= totalLines) { startLine += 100; loadBlame(); } };
  $("btnTour").onclick = loadTour;
  $("authorFilter").addEventListener("input", renderBlameTable);

  bridge.call("plugin:ready", {}).then(() => {
    bridge.call("theme:subscribe", {}).catch(() => {});
    loadTour();
    loadBlame();
  });
}
