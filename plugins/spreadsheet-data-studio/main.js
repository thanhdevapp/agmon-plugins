import { createIcon } from "./icons.js";

export function colIndexToLetter(colIdx) {
  let n = colIdx;
  let out = "";
  while (n >= 0) {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  }
  return out;
}

export function letterToColIndex(letters) {
  let col = 0;
  for (const ch of String(letters || "").toUpperCase()) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return col - 1;
}

/**
 * Pure Spreadsheet Formula Evaluator supporting:
 *  - Range functions: =SUM(A1:A5), =AVG(...), =MIN(...), =MAX(...), =COUNT(...), =MEDIAN(...)
 *  - Conditional: =IF(B2>10, "High", "Low")
 *  - Binary cell arithmetic: =B2*C2, =B2+B3, =B2-B3, =B2/B3
 */
export function evaluateCellFormula(rawVal, rows, depth = 0) {
  const s = String(rawVal ?? "").trim();
  if (!s.startsWith("=") || depth > 8) return s;

  const resolveCell = (ref) => {
    const m = /^([A-Z]+)(\d+)$/i.exec(ref.trim());
    if (!m) return Number(ref);
    const c = letterToColIndex(m[1]);
    const r = Number(m[2]) - 1;
    const raw = rows[r]?.[c];
    if (raw === undefined) return 0;
    const val = String(raw).startsWith("=") ? evaluateCellFormula(raw, rows, depth + 1) : raw;
    const num = Number(val);
    return Number.isFinite(num) ? num : 0;
  };

  // 1. Range aggregate functions
  const rangeMatch = /^=(SUM|AVG|AVERAGE|MIN|MAX|COUNT|MEDIAN)\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/i.exec(s);
  if (rangeMatch) {
    const fn = rangeMatch[1].toUpperCase();
    const c1 = Math.min(letterToColIndex(rangeMatch[2]), letterToColIndex(rangeMatch[4]));
    const c2 = Math.max(letterToColIndex(rangeMatch[2]), letterToColIndex(rangeMatch[4]));
    const r1 = Math.max(0, Math.min(Number(rangeMatch[3]) - 1, Number(rangeMatch[5]) - 1));
    const r2 = Math.min(rows.length - 1, Math.max(Number(rangeMatch[3]) - 1, Number(rangeMatch[5]) - 1));
    const nums = [];
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cellRaw = rows[r]?.[c];
        if (cellRaw === undefined || String(cellRaw).trim() === "") continue;
        const resolved = String(cellRaw).startsWith("=") ? evaluateCellFormula(cellRaw, rows, depth + 1) : cellRaw;
        const n = Number(resolved);
        if (Number.isFinite(n)) nums.push(n);
      }
    }
    if (fn === "COUNT") return String(nums.length);
    if (nums.length === 0) return "0";
    if (fn === "SUM") return String(Math.round(nums.reduce((a, b) => a + b, 0) * 1000) / 1000);
    if (fn === "AVG" || fn === "AVERAGE") return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
    if (fn === "MIN") return String(Math.min(...nums));
    if (fn === "MAX") return String(Math.max(...nums));
    if (fn === "MEDIAN") {
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      return String(Math.round(med * 1000) / 1000);
    }
  }

  // 2. Simple IF(lhs op rhs, trueVal, falseVal)
  const ifMatch = /^=IF\(\s*([A-Z]+\d+|\d+(?:\.\d+)?)\s*(>=|<=|!=|=|>|<)\s*([A-Z]+\d+|\d+(?:\.\d+)?)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i.exec(s);
  if (ifMatch) {
    const a = resolveCell(ifMatch[1]);
    const op = ifMatch[2];
    const b = resolveCell(ifMatch[3]);
    const cond =
      op === ">" ? a > b : op === "<" ? a < b : op === ">=" ? a >= b : op === "<=" ? a <= b : op === "!=" ? a !== b : a === b;
    return (cond ? ifMatch[4] : ifMatch[5]).trim().replace(/^["']|["']$/g, "");
  }

  // 3. Binary arithmetic (=B2*C2, =B2+B3, =B2-B3, =B2/B3)
  const arith = /^=\s*([A-Z]+\d+|\d+(?:\.\d+)?)\s*([+\-*/])\s*([A-Z]+\d+|\d+(?:\.\d+)?)\s*$/i.exec(s);
  if (arith) {
    const a = resolveCell(arith[1]);
    const b = resolveCell(arith[3]);
    const op = arith[2];
    const res = op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : b === 0 ? NaN : a / b;
    return Number.isFinite(res) ? String(Math.round(res * 1000) / 1000) : "#DIV/0!";
  }

  return s;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function createBridge(handlers) {
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
    } else if (msg.method === "editor:openedFileChanged") {
      handlers?.onOpenedFileChanged?.(msg.params || {});
    }
  });
  function call(method, params = {}, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const id = `sheet-${Date.now()}-${seq++}`;
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

if (typeof document !== "undefined" && document.getElementById("content")) {
  const $ = (id) => document.getElementById(id);
  const contentEl = $("content");
  const statusEl = $("status");
  const filterEl = $("filter");
  const formulaBarEl = $("formulaBar");
  const cellRefEl = $("cellRef");
  const formulaInputEl = $("formulaInput");

  const setBtn = (id, icon, text) => {
    const b = $(id);
    b.replaceChildren(createIcon(icon, 13), el("span", "", text));
  };
  setBtn("btnAddRow", "plus", "Row");
  setBtn("btnAddCol", "plus", "Col");
  setBtn("btnUndo", "undo", "Undo");
  setBtn("btnExportCsv", "download", "CSV");
  setBtn("btnSave", "save", "Save");

  let rows = [];
  let delim = "\t";
  let currentMtimeMs = null;
  let currentExt = ".tsv";
  let currentFile = "sheet.tsv";
  let activeCell = { r: 1, c: 0 };
  let sortState = { col: -1, asc: true };
  let undoStack = [];
  let loadGen = 0;

  const bridge = createBridge({ onOpenedFileChanged: () => loadFile() });

  function snapshotUndo() {
    undoStack.push(JSON.stringify(rows));
    if (undoStack.length > 30) undoStack.shift();
  }

  function serializeGrid() {
    return rows.map((r) => r.join(delim)).join("\n") + "\n";
  }

  function syncFormulaBar() {
    const raw = rows[activeCell.r]?.[activeCell.c] ?? "";
    cellRefEl.textContent = `${colIndexToLetter(activeCell.c)}${activeCell.r + 1}`;
    formulaInputEl.value = raw;
  }

  function renderGrid() {
    formulaBarEl.style.display = "flex";
    const q = filterEl.value.trim().toLowerCase();
    if (!rows.length) {
      contentEl.replaceChildren(el("div", "badge", "Empty sheet"));
      return;
    }
    const headers = rows[0];
    const table = el("table");
    const thead = el("thead");
    const headRow = el("tr");
    headRow.appendChild(el("th", "mono", "#"));
    headers.forEach((h, cIdx) => {
      const th = el("th", "", `${colIndexToLetter(cIdx)}: ${h}${sortState.col === cIdx ? (sortState.asc ? " ^" : " v") : ""}`);
      th.onclick = () => {
        snapshotUndo();
        const asc = sortState.col === cIdx ? !sortState.asc : true;
        sortState = { col: cIdx, asc };
        const bodyRows = rows.slice(1).filter((r) => !r.some((v) => String(v).startsWith("=")));
        const formulaRows = rows.slice(1).filter((r) => r.some((v) => String(v).startsWith("=")));
        bodyRows.sort((a, b) => {
          const av = a[cIdx] ?? "";
          const bv = b[cIdx] ?? "";
          const an = Number(av);
          const bn = Number(bv);
          const cmp = Number.isFinite(an) && Number.isFinite(bn) && av !== "" && bv !== ""
            ? an - bn
            : String(av).localeCompare(String(bv));
          return asc ? cmp : -cmp;
        });
        rows = [headers, ...bodyRows, ...formulaRows];
        renderGrid();
      };
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (q && !row.join(" ").toLowerCase().includes(q)) continue;
      const tr = el("tr");
      tr.appendChild(el("td", "mono", String(r + 1)));
      for (let c = 0; c < headers.length; c++) {
        const raw = row[c] ?? "";
        const isFormula = raw.startsWith("=");
        const shown = isFormula ? evaluateCellFormula(raw, rows) : raw;
        const td = el("td", isFormula ? "formula-cell" : "", shown);
        td.contentEditable = "true";
        td.title = raw;
        td.addEventListener("focus", () => {
          activeCell = { r, c };
          syncFormulaBar();
          if (isFormula) td.textContent = raw;
        });
        td.addEventListener("blur", () => {
          const next = td.textContent || "";
          if (rows[r][c] !== next) {
            snapshotUndo();
            rows[r][c] = next;
            syncFormulaBar();
            renderGrid();
          } else if (next.startsWith("=")) {
            td.textContent = evaluateCellFormula(next, rows);
          }
        });
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    contentEl.replaceChildren(table);
    // Live selection & active-column numeric summary (Count, Sum, Avg)
    const nums = [];
    for (let r = 1; r < rows.length; r++) {
      const raw = rows[r]?.[activeCell.c] ?? "";
      const val = raw.startsWith("=") ? evaluateCellFormula(raw, rows) : raw;
      const n = Number(val);
      if (val !== "" && Number.isFinite(n)) nums.push(n);
    }
    if (nums.length > 0) {
      const sum = nums.reduce((a, b) => a + b, 0);
      const avg = sum / nums.length;
      statusEl.textContent = `${rows.length - 1} rows · Col ${colIndexToLetter(activeCell.c)}: Count ${nums.length} · Sum ${sum.toFixed(2)} · Avg ${avg.toFixed(2)}`;
    }
    syncFormulaBar();
  }

  async function renderSqliteStudio() {
    formulaBarEl.style.display = "none";
    const layout = el("div", "sqlite-layout");
    const side = el("aside", "sqlite-side");
    const main = el("section", "sqlite-main");

    side.appendChild(el("div", "badge", "SQLite Schema (Read-Only)"));
    const sqlInput = el("textarea", "input mono sql-box");
    sqlInput.placeholder = "SELECT * FROM table_name LIMIT 50;";
    const runBar = el("div", "bar");
    runBar.style.padding = "4px 0";
    runBar.style.background = "transparent";
    runBar.style.borderBottom = "0";
    const runBtn = el("button", "btn primary");
    runBtn.replaceChildren(createIcon("play", 13), el("span", "", "Run SELECT"));
    const queryMeta = el("span", "badge", "Read-only node:sqlite");
    runBar.append(runBtn, queryMeta);

    const resultWrap = el("div", "result-wrap");
    main.append(sqlInput, runBar, resultWrap);
    layout.append(side, main);
    contentEl.replaceChildren(layout);

    async function executeSql(sql) {
      try {
        const res = await bridge.call("editor:sqliteQuery", { sql });
        const q = res.result;
        queryMeta.textContent = `${q.rowCount} rows · ${q.elapsedMs}ms${q.truncated ? " (capped 200)" : ""}`;
        const tbl = el("table");
        const thead = el("thead");
        const hr = el("tr");
        for (const col of q.columns) hr.appendChild(el("th", "mono", col));
        thead.appendChild(hr);
        const tbody = el("tbody");
        for (const row of q.rows) {
          const tr = el("tr");
          for (const cell of row) tr.appendChild(el("td", "mono", cell === null ? "NULL" : String(cell)));
          tbody.appendChild(tr);
        }
        tbl.append(thead, tbody);
        resultWrap.replaceChildren(tbl);
        statusEl.textContent = `SQLite query OK (${q.rowCount} rows in ${q.elapsedMs}ms)`;
      } catch (err) {
        resultWrap.replaceChildren(el("div", "error-text mono", err.message));
        statusEl.textContent = err.message;
      }
    }

    runBtn.onclick = () => executeSql(sqlInput.value);
    sqlInput.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        executeSql(sqlInput.value);
      }
    });

    try {
      const { schema } = await bridge.call("editor:sqliteInspect", {});
      statusEl.textContent = `SQLite: ${schema.tables.length} tables · ${schema.indexes.length} indexes · ${schema.byteLength} B`;
      let firstTable = null;
      for (const tbl of schema.tables) {
        if (!firstTable) firstTable = tbl;
        const btn = el("button", "tbl-btn");
        btn.append(el("span", "", tbl.name), el("span", "badge", `${tbl.rowCount} rows`));
        btn.onclick = () => {
          side.querySelectorAll(".tbl-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          sqlInput.value = `SELECT * FROM "${tbl.name.replace(/"/g, '""')}" LIMIT 50;`;
          executeSql(sqlInput.value);
        };
        side.appendChild(btn);
      }
      if (firstTable) {
        side.querySelector(".tbl-btn")?.classList.add("active");
        sqlInput.value = `SELECT * FROM "${firstTable.name.replace(/"/g, '""')}" LIMIT 50;`;
        await executeSql(sqlInput.value);
      } else {
        resultWrap.replaceChildren(el("div", "badge", "Database has 0 user tables."));
      }
    } catch (err) {
      resultWrap.replaceChildren(el("div", "error-text mono", err.message));
      statusEl.textContent = err.message;
    }
  }

  async function loadFile() {
    const gen = ++loadGen;
    try {
      const res = await bridge.call("editor:readOpenedFile", {});
      if (gen !== loadGen) return;
      currentFile = res.fileName;
      currentExt = res.extension;
      currentMtimeMs = res.mtimeMs ?? null;
      $("title").textContent = `Data Studio — ${currentFile}`;

      if ([".sqlite", ".sqlite3", ".db"].includes(currentExt)) {
        await renderSqliteStudio();
        return;
      }
      if (res.encoding === "base64" || ![".csv", ".tsv"].includes(currentExt)) {
        formulaBarEl.style.display = "none";
        contentEl.replaceChildren(
          el("div", "badge", `Binary spreadsheet (${currentExt}) · ${res.byteLength} bytes (read-only)`)
        );
        statusEl.textContent = `Read-only binary (${res.byteLength} B)`;
        return;
      }
      delim = currentExt === ".tsv" ? "\t" : ",";
      rows = String(res.content || "").trim().split(/\r?\n/).map((line) => line.split(delim));
      undoStack = [];
      renderGrid();
      statusEl.textContent = `${rows.length} rows · ${rows[0]?.length || 0} cols`;
    } catch (err) {
      statusEl.textContent = err.message;
    }
  }

  formulaInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && rows[activeCell.r]) {
      snapshotUndo();
      rows[activeCell.r][activeCell.c] = formulaInputEl.value;
      renderGrid();
    }
  });
  filterEl.addEventListener("input", renderGrid);
  $("btnAddRow").onclick = () => {
    if (!rows.length) return;
    snapshotUndo();
    rows.push(rows[0].map(() => ""));
    renderGrid();
  };
  $("btnAddCol").onclick = () => {
    if (!rows.length) return;
    snapshotUndo();
    rows[0].push(`Col${rows[0].length + 1}`);
    for (let r = 1; r < rows.length; r++) rows[r].push("");
    renderGrid();
  };
  $("btnUndo").onclick = () => {
    if (!undoStack.length) return;
    rows = JSON.parse(undoStack.pop());
    renderGrid();
  };
  $("btnExportCsv").onclick = async () => {
    await bridge.call("files:exportCopy", {
      fileName: currentFile.endsWith(".csv") ? currentFile : `${currentFile}.csv`,
      mimeType: "text/csv",
      content: serializeGrid(),
    });
    statusEl.textContent = "Exported CSV";
  };
  $("btnSave").onclick = async () => {
    if (![".csv", ".tsv"].includes(currentExt)) {
      statusEl.textContent = "Binary/SQLite file is read-only";
      return;
    }
    try {
      const res = await bridge.call("editor:saveOpenedFile", {
        content: serializeGrid(),
        encoding: "utf-8",
        expectedMtimeMs: currentMtimeMs,
      });
      currentMtimeMs = res.mtimeMs;
      statusEl.textContent = `Saved (${res.byteLength} B)`;
    } catch (err) {
      statusEl.textContent = err.message;
    }
  };

  bridge.call("plugin:ready", {}).then(() => {
    bridge.call("theme:subscribe", {}).catch(() => {});
    loadFile();
  });
}
