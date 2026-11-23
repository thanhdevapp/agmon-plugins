import { createIcon } from "./icons.js";

export function stripJsoncComments(raw) {
  return String(raw || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1")
    .replace(/,\s*([}\]])/g, "$1");
}

export function detectDocumentMode(parsed) {
  if (!parsed || typeof parsed !== "object") return "raw";
  if (parsed.openapi || parsed.swagger) return "openapi";
  if (parsed.log && Array.isArray(parsed.log.entries)) return "har";
  return "json";
}

export function extractOpenApiEndpoints(doc) {
  const out = [];
  for (const [p, ops] of Object.entries(doc?.paths || {})) {
    if (!ops || typeof ops !== "object") continue;
    for (const [method, info] of Object.entries(ops)) {
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method.toLowerCase())) continue;
      out.push({
        method: method.toUpperCase(),
        path: p,
        summary: String(info?.summary || info?.operationId || info?.description || ""),
        tags: Array.isArray(info?.tags) ? info.tags : [],
      });
    }
  }
  return out;
}

export function extractHarWaterfall(doc) {
  const entries = Array.isArray(doc?.log?.entries) ? doc.log.entries : [];
  if (!entries.length) return { entries: [], totalMs: 0, totalBytes: 0 };
  const startTimes = entries.map((e) => Date.parse(e.startedDateTime || 0) || 0);
  const minStart = Math.min(...startTimes);
  let maxEnd = minStart + 1;
  let totalBytes = 0;

  const normalized = entries.slice(0, 200).map((e, i) => {
    const startMs = Math.max(0, (startTimes[i] || minStart) - minStart);
    const timeMs = Math.max(1, Math.round(Number(e.time || 0)));
    if (startMs + timeMs > maxEnd - minStart) maxEnd = minStart + startMs + timeMs;
    const size = Math.max(0, Number(e.response?.content?.size ?? e.response?.bodySize ?? 0));
    totalBytes += size;
    return {
      method: String(e.request?.method || "GET").toUpperCase(),
      url: String(e.request?.url || ""),
      status: Number(e.response?.status || 0),
      timeMs,
      startMs,
      size,
    };
  });
  const totalMs = Math.max(1, maxEnd - minStart);
  return { entries: normalized, totalMs, totalBytes };
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
      const id = `jview-${Date.now()}-${seq++}`;
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

if (typeof document !== "undefined" && document.getElementById("root")) {
  const $ = (id) => document.getElementById(id);
  let parsedDoc = null;
  let rawText = "";
  let forceTree = false;
  const collapsedPaths = new Set();

  function renderTreeNode(key, val, jsonPath, depth, q) {
    const wrap = el("div");
    const isObj = val !== null && typeof val === "object";
    const row = el("div", "tree-row");
    row.style.paddingLeft = `${depth * 14 + 4}px`;

    const isCollapsed = collapsedPaths.has(jsonPath);
    if (isObj) {
      row.appendChild(createIcon(isCollapsed ? "chevRight" : "chevDown", 12));
    } else {
      const sp = el("span", "", " ");
      sp.style.width = "12px";
      row.appendChild(sp);
    }

    if (key !== null) {
      row.appendChild(el("span", "tree-key", `${key}:`));
    }

    if (isObj) {
      const entries = Object.entries(val);
      const summary = Array.isArray(val) ? `[${entries.length} items]` : `{${entries.length} keys}`;
      row.appendChild(el("span", "muted", summary));
      row.onclick = () => {
        if (collapsedPaths.has(jsonPath)) collapsedPaths.delete(jsonPath);
        else collapsedPaths.add(jsonPath);
        $("pathCrumb").textContent = jsonPath;
        renderView();
      };
      wrap.appendChild(row);
      if (!isCollapsed && depth < 7) {
        entries.slice(0, 100).forEach(([k, v]) => {
          const childPath = Array.isArray(val) ? `${jsonPath}[${k}]` : `${jsonPath}.${k}`;
          if (q && !childPath.toLowerCase().includes(q) && !JSON.stringify(v).toLowerCase().includes(q)) return;
          wrap.appendChild(renderTreeNode(k, v, childPath, depth + 1, q));
        });
      }
    } else {
      const cls = typeof val === "string" ? "tree-str" : typeof val === "number" ? "tree-num" : "tree-bool";
      row.appendChild(el("span", cls, JSON.stringify(val)));
      row.onclick = () => {
        $("pathCrumb").textContent = `${jsonPath} = ${JSON.stringify(val)}`;
      };
      wrap.appendChild(row);
    }
    return wrap;
  }

  function renderView() {
    const q = $("filter").value.trim().toLowerCase();
    const methodF = $("methodFilter").value;
    const mode = parsedDoc ? detectDocumentMode(parsedDoc) : "raw";
    $("methodFilter").hidden = !(mode === "openapi" && !forceTree);

    if (mode === "openapi" && !forceTree) {
      $("modeBadge").textContent = `OpenAPI ${parsedDoc.openapi || parsedDoc.swagger}`;
      const endpoints = extractOpenApiEndpoints(parsedDoc).filter(
        (e) => (!methodF || e.method === methodF) && (!q || `${e.method} ${e.path} ${e.summary}`.toLowerCase().includes(q))
      );
      $("status").textContent = `${endpoints.length} endpoints`;
      $("summaryMeta").textContent = `${parsedDoc.info?.title || "API"} v${parsedDoc.info?.version || "1.0"}`;

      const card = el("div", "card");
      const titleRow = el("div");
      titleRow.style.marginBottom = "8px";
      titleRow.append(
        el("strong", "", parsedDoc.info?.title || "OpenAPI Specification"),
        el("span", "badge", ` v${parsedDoc.info?.version || ""}`)
      );
      const tbl = el("table");
      const thead = el("thead");
      const hr = el("tr");
      for (const h of ["Method", "Path", "Summary"]) hr.appendChild(el("th", "", h));
      thead.appendChild(hr);
      const tbody = el("tbody");
      for (const ep of endpoints) {
        const tr = el("tr");
        const mTd = el("td");
        mTd.appendChild(el("span", `method-pill m-${ep.method}`, ep.method));
        tr.append(mTd, el("td", "mono", ep.path), el("td", "", ep.summary));
        tr.onclick = () => {
          $("pathCrumb").textContent = `$.paths["${ep.path}"].${ep.method.toLowerCase()}`;
        };
        tbody.appendChild(tr);
      }
      tbl.append(thead, tbody);
      card.append(titleRow, tbl);
      $("root").replaceChildren(card);
      return;
    }

    if (mode === "har" && !forceTree) {
      $("modeBadge").textContent = "HAR Waterfall";
      const wf = extractHarWaterfall(parsedDoc);
      const list = wf.entries.filter((e) => !q || `${e.method} ${e.status} ${e.url}`.toLowerCase().includes(q));
      $("status").textContent = `${list.length} requests · ${wf.totalMs}ms`;
      $("summaryMeta").textContent = `Total transfer: ${(wf.totalBytes / 1024).toFixed(1)} KB`;

      const card = el("div", "card");
      const tbl = el("table");
      const thead = el("thead");
      const hr = el("tr");
      for (const h of ["Method", "Status", "URL", "Time", "Waterfall"]) hr.appendChild(el("th", "", h));
      thead.appendChild(hr);
      const tbody = el("tbody");
      for (const item of list) {
        const tr = el("tr");
        const mTd = el("td");
        mTd.appendChild(el("span", `method-pill m-${item.method}`, item.method));
        const stBadge = el("span", "badge", String(item.status));
        if (item.status >= 400) stBadge.style.color = "#f87171";
        else if (item.status >= 200 && item.status < 300) stBadge.style.color = "#34d399";
        const stTd = el("td");
        stTd.appendChild(stBadge);
        const wfTd = el("td");
        const track = el("div", "wf-track");
        const bar = el("div", "wf-bar");
        bar.style.left = `${Math.round((item.startMs / wf.totalMs) * 100)}%`;
        bar.style.width = `${Math.max(3, Math.round((item.timeMs / wf.totalMs) * 100))}%`;
        track.appendChild(bar);
        wfTd.appendChild(track);
        tr.append(mTd, stTd, el("td", "mono", item.url.slice(0, 72)), el("td", "mono", `${item.timeMs}ms`), wfTd);
        tbody.appendChild(tr);
      }
      tbl.append(thead, tbody);
      card.appendChild(tbl);
      $("root").replaceChildren(card);
      return;
    }

    if (parsedDoc && typeof parsedDoc === "object") {
      $("modeBadge").textContent = "JSON Tree";
      const card = el("div", "card");
      card.appendChild(renderTreeNode("$", parsedDoc, "$", 0, q));
      $("root").replaceChildren(card);
      return;
    }

    $("modeBadge").textContent = "Structured Text";
    const pre = el("pre", "card mono", rawText.slice(0, 30000));
    pre.style.whiteSpace = "pre-wrap";
    $("root").replaceChildren(pre);
  }

  const bridge = createBridge({ onOpenedFileChanged: () => loadFile() });
  async function loadFile() {
    try {
      const res = await bridge.call("editor:readOpenedFile", {});
      $("title").textContent = `Viewer — ${res.fileName}`;
      rawText = String(res.content || "");
      parsedDoc = null;
      try {
        parsedDoc = JSON.parse(stripJsoncComments(rawText));
      } catch {
        parsedDoc = null;
      }
      $("status").textContent = `${res.byteLength} B`;
      renderView();
    } catch (err) {
      $("status").textContent = err.message;
    }
  }

  $("filter").addEventListener("input", renderView);
  $("methodFilter").addEventListener("change", renderView);
  $("btnToggleTree").onclick = () => {
    forceTree = !forceTree;
    renderView();
  };

  bridge.call("plugin:ready", {}).then(() => {
    bridge.call("theme:subscribe", {}).catch(() => {});
    loadFile();
  });
}
