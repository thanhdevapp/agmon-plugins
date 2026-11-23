import { createIcon } from "./icons.js";

export function formatMaybeJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return String(text || "");
  }
}

export function buildExportCollection(items) {
  return (items || [])
    .map((q) => `### [${String(q.mode || "sql").toUpperCase()}] ${q.name}\n${q.body}\n`)
    .join("\n");
}

/**
 * Parses typed result filter syntax: `text`, `=x`, `!=x`, `>x`, `>=x`, `<x`, `<=x`, `null`, `!null`.
 */
export function parseColumnFilter(input) {
  const text = String(input ?? "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower === "null" || lower === "is null") return { op: "null" };
  if (lower === "!null" || lower === "not null" || lower === "is not null") return { op: "notnull" };
  const m = /^(>=|<=|!=|<>|=|>|<)\s*(.+)$/.exec(text);
  if (m) {
    const op = m[1] === "<>" ? "!=" : m[1];
    const num = Number(m[2]);
    return { op, raw: m[2], num: Number.isFinite(num) && m[2].trim() !== "" ? num : null };
  }
  return { op: "contains", raw: lower };
}

export function filterSqlRows(rows, filterExpr) {
  const f = parseColumnFilter(filterExpr);
  if (!f) return rows || [];
  return (rows || []).filter((row) =>
    row.some((cell) => {
      if (f.op === "null") return cell === null || cell === undefined;
      if (f.op === "notnull") return cell !== null && cell !== undefined;
      if (cell === null || cell === undefined) return false;
      const str = String(cell);
      if (f.op === "contains") return str.toLowerCase().includes(f.raw);
      const cellNum = Number(cell);
      const useNum = f.num !== null && Number.isFinite(cellNum) && str.trim() !== "";
      if (f.num !== null && !useNum && [">", ">=", "<", "<="].includes(f.op)) return false;
      const lhs = useNum ? cellNum : str;
      const rhs = useNum ? f.num : f.raw;
      if (f.op === "=") return lhs === rhs;
      if (f.op === "!=") return lhs !== rhs;
      if (f.op === ">") return lhs > rhs;
      if (f.op === ">=") return lhs >= rhs;
      if (f.op === "<") return lhs < rhs;
      if (f.op === "<=") return lhs <= rhs;
      return false;
    })
  );
}

export function rowsToCsv(columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(esc).join(","), ...(rows || []).map((r) => r.map(esc).join(","))].join("\n");
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
      const id = `dbapi-${Date.now()}-${seq++}`;
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

if (typeof document !== "undefined" && document.getElementById("paneSql")) {
  const $ = (id) => document.getElementById(id);
  const setBtn = (id, icon, text) => {
    const b = $(id);
    b.replaceChildren(createIcon(icon, 13), el("span", "", text));
  };
  setBtn("tabSql", "database", "SQLite Explorer");
  setBtn("tabHttp", "globe", "Local HTTP / GraphQL");
  setBtn("btnSave", "save", "Save");
  setBtn("btnExport", "download", "Export");
  setBtn("btnScanDbs", "refresh", "Rescan DBs");
  setBtn("btnRunSql", "play", "Run Query");
  setBtn("btnSendHttp", "play", "Send");

  const bridge = createBridge();
  let activeTab = "sql";
  let saved = [];
  let sqlGen = 0;

  function switchTab(next) {
    activeTab = next;
    $("paneSql").hidden = next !== "sql";
    $("paneHttp").hidden = next !== "http";
    $("tabSql").classList.toggle("active", next === "sql");
    $("tabHttp").classList.toggle("active", next === "http");
    $("tabSql").setAttribute("aria-selected", String(next === "sql"));
    $("tabHttp").setAttribute("aria-selected", String(next === "http"));
  }

  $("tabSql").onclick = () => switchTab("sql");
  $("tabHttp").onclick = () => switchTab("http");

  function renderSaved() {
    const container = $("savedList");
    if (!saved.length) {
      container.replaceChildren(el("div", "badge", "No saved queries or requests yet."));
      return;
    }
    const frag = document.createDocumentFragment();
    saved.forEach((item) => {
      const row = el("div", "row between");
      row.style.marginBottom = "5px";
      const left = el("div", "row");
      left.append(el("span", "badge", item.mode), el("span", "", item.name));
      const loadBtn = el("button", "btn", "Load");
      loadBtn.onclick = () => {
        if (item.mode === "http") {
          switchTab("http");
          $("httpMethod").value = item.httpMethod || "GET";
          $("httpUrl").value = item.httpUrl || "http://127.0.0.1:4000/health";
          $("httpBody").value = item.body || "";
        } else {
          switchTab("sql");
          $("qName").value = item.name;
          $("qBody").value = item.body;
        }
      };
      row.append(left, loadBtn);
      frag.appendChild(row);
    });
    container.replaceChildren(frag);
  }

  async function scanDatabases() {
    const gen = ++sqlGen;
    const dbSel = $("dbSelect");
    const tblSel = $("tableSelect");
    try {
      const res = await bridge.call("db:listWorkspaceSqlite", {});
      if (gen !== sqlGen) return;
      const dbs = res.databases || [];
      dbSel.replaceChildren();
      if (!dbs.length) {
        dbSel.appendChild(el("option", "", "No .sqlite/.db files found in workspace"));
        tblSel.replaceChildren(el("option", "", "No tables"));
        $("sqlResult").replaceChildren(el("div", "badge", "Add a .sqlite/.db file in the workspace or compose SQL queries to save/export."));
        return;
      }
      for (const db of dbs) {
        const opt = el("option", "", `${db.relativePath} (${(db.byteLength / 1024).toFixed(1)} KB)`);
        opt.value = db.relativePath;
        dbSel.appendChild(opt);
      }
      await loadSchemaForSelectedDb();
    } catch (err) {
      $("status").textContent = err.message;
    }
  }

  async function loadSchemaForSelectedDb() {
    const rel = $("dbSelect").value;
    const tblSel = $("tableSelect");
    if (!rel || rel.startsWith("No ")) return;
    try {
      const { schema } = await bridge.call("db:inspectWorkspaceSqlite", { relativePath: rel });
      tblSel.replaceChildren();
      for (const tbl of schema.tables || []) {
        const opt = el("option", "", `${tbl.name} (${tbl.rowCount} rows)`);
        opt.value = tbl.name;
        tblSel.appendChild(opt);
      }
      if (schema.tables?.length) {
        const first = schema.tables[0].name;
        if (!$("qBody").value.trim()) {
          $("qBody").value = `SELECT * FROM "${first.replace(/"/g, '""')}" LIMIT 50;`;
        }
        await runSql();
      }
    } catch (err) {
      $("status").textContent = err.message;
    }
  }

  let lastQueryResult = null;

  function renderSqlTable() {
    if (!lastQueryResult) return;
    const filtered = filterSqlRows(lastQueryResult.rows, $("resultFilter")?.value || "");
    const tbl = el("table");
    const thead = el("thead");
    const hr = el("tr");
    for (const c of lastQueryResult.columns) hr.appendChild(el("th", "mono", c));
    thead.appendChild(hr);
    const tbody = el("tbody");
    for (const row of filtered) {
      const tr = el("tr");
      row.forEach((cell, idx) => {
        const display = cell === null ? "NULL" : String(cell);
        const td = el("td", "mono", display.length > 64 ? `${display.slice(0, 61)}...` : display);
        td.style.cursor = "pointer";
        td.title = "Click to inspect full cell value";
        td.onclick = () => {
          const insp = $("cellInspector");
          insp.hidden = false;
          insp.textContent = `${lastQueryResult.columns[idx]}:\n${formatMaybeJson(display)}`;
        };
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    tbl.append(thead, tbody);
    $("sqlResult").replaceChildren(tbl);
    $("sqlMeta").textContent = `${filtered.length}/${lastQueryResult.rowCount} rows · ${lastQueryResult.elapsedMs}ms`;
  }

  async function runSql() {
    const rel = $("dbSelect").value;
    const sql = $("qBody").value.trim();
    if (!rel || rel.startsWith("No ") || !sql) {
      $("sqlMeta").textContent = "Select a workspace SQLite file first";
      return;
    }
    try {
      const { result } = await bridge.call("db:queryWorkspaceSqlite", { relativePath: rel, sql });
      lastQueryResult = result;
      $("sqlMeta").className = "badge ok";
      $("cellInspector").hidden = true;
      renderSqlTable();
      $("status").textContent = `Query OK (${result.rowCount} rows in ${result.elapsedMs}ms)`;
    } catch (err) {
      lastQueryResult = null;
      $("sqlMeta").textContent = err.code || "Error";
      $("sqlMeta").className = "badge err";
      $("sqlResult").replaceChildren(el("div", "badge err", err.message));
      $("status").textContent = err.message;
    }
  }

  $("resultFilter").oninput = renderSqlTable;
  $("qBody").addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runSql();
    }
  });
  $("btnCsvExport").onclick = async () => {
    if (!lastQueryResult) return;
    const filtered = filterSqlRows(lastQueryResult.rows, $("resultFilter")?.value || "");
    await bridge.call("files:exportCopy", {
      fileName: "query-result.csv",
      mimeType: "text/csv",
      content: rowsToCsv(lastQueryResult.columns, filtered),
    });
    $("status").textContent = `Exported ${filtered.length} rows to CSV`;
  };

  $("dbSelect").onchange = loadSchemaForSelectedDb;
  $("tableSelect").onchange = () => {
    const t = $("tableSelect").value;
    if (t) {
      $("qBody").value = `SELECT * FROM "${t.replace(/"/g, '""')}" LIMIT 50;`;
      runSql();
    }
  };
  $("btnScanDbs").onclick = scanDatabases;
  $("btnRunSql").onclick = runSql;

  $("btnSendHttp").onclick = async () => {
    let parsedHeaders = {};
    const rawH = $("httpHeaders").value.trim();
    if (rawH) {
      try {
        parsedHeaders = JSON.parse(rawH);
      } catch {
        $("httpMeta").textContent = "Invalid headers JSON";
        $("httpMeta").className = "badge err";
        return;
      }
    }
    $("httpMeta").textContent = "Sending...";
    $("httpMeta").className = "badge";
    try {
      const { response } = await bridge.call("http:sendLocalRequest", {
        url: $("httpUrl").value.trim(),
        method: $("httpMethod").value,
        headers: parsedHeaders,
        body: $("httpBody").value || undefined,
      });
      $("httpMeta").textContent = `HTTP ${response.status} ${response.statusText} · ${response.elapsedMs}ms · ${response.byteLength} B`;
      $("httpMeta").className = response.status >= 200 && response.status < 400 ? "badge ok" : "badge warn";
      $("httpResp").textContent = formatMaybeJson(response.body);
      $("status").textContent = `HTTP ${response.status} in ${response.elapsedMs}ms`;
    } catch (err) {
      $("httpMeta").textContent = err.code || "Blocked";
      $("httpMeta").className = "badge err";
      $("httpResp").textContent = err.message;
      $("status").textContent = err.message;
    }
  };

  $("btnSave").onclick = async () => {
    const entry = activeTab === "http"
      ? {
          name: `${$("httpMethod").value} ${$("httpUrl").value.trim().slice(0, 44)}`,
          mode: "http",
          httpMethod: $("httpMethod").value,
          httpUrl: $("httpUrl").value.trim(),
          body: $("httpBody").value.trim(),
        }
      : {
          name: $("qName").value.trim() || `SQL Query #${saved.length + 1}`,
          mode: "sql",
          body: $("qBody").value.trim(),
        };
    if (!entry.body && entry.mode === "sql") return;
    saved.unshift(entry);
    saved = saved.slice(0, 25);
    await bridge.call("storage:set", { key: "savedQueries", value: saved }).catch(() => {});
    renderSaved();
    $("status").textContent = `Saved "${entry.name}"`;
  };

  $("btnExport").onclick = async () => {
    await bridge.call("files:exportCopy", {
      fileName: "db-api-collection.http",
      mimeType: "text/plain",
      content: buildExportCollection(saved),
    });
    $("status").textContent = "Exported collection";
  };

  bridge.call("plugin:ready", {}).then(async () => {
    bridge.call("theme:subscribe", {}).catch(() => {});
    const st = await bridge.call("storage:get", {}).catch(() => ({ storage: {} }));
    saved = Array.isArray(st?.storage?.savedQueries) ? st.storage.savedQueries : [];
    renderSaved();
    await scanDatabases();
  });
}
