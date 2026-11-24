import { createIcon } from "./icons.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const GRID_STEP = 10;
const MAX_HISTORY = 50;

export function snap(v) {
  return Math.round(Number(v || 0) / GRID_STEP) * GRID_STEP;
}

/**
 * Pure parser supporting Excalidraw v2 JSON, Obsidian JSON Canvas,
 * and Mermaid flowchart (`A[Label] --> B{Decision}`).
 */
export function parseDiagramSource(text) {
  const raw = String(text || "").trim();
  if (!raw) return { format: "excalidraw", nodes: [], edges: [] };

  try {
    const obj = JSON.parse(raw);
    if (Array.isArray(obj.elements)) {
      const nodes = [];
      const edges = [];
      for (let i = 0; i < obj.elements.length; i++) {
        const e = obj.elements[i];
        if (e.type === "arrow" || e.type === "line") {
          edges.push({
            id: e.id || `edge-${i + 1}`,
            fromId: e.fromId || null,
            toId: e.toId || null,
            x1: Number(e.x ?? 40),
            y1: Number(e.y ?? 40),
            x2: Number(e.x2 ?? Number(e.x ?? 40) + Number(e.width || 160)),
            y2: Number(e.y2 ?? Number(e.y ?? 40) + Number(e.height || 0)),
            label: String(e.label || ""),
          });
        } else {
          nodes.push({
            id: e.id || `el-${i + 1}`,
            shape: ["rectangle", "diamond", "database", "sticky"].includes(e.type) ? e.type : "rectangle",
            x: Number(e.x ?? 40 + (i % 3) * 210),
            y: Number(e.y ?? 40 + Math.floor(i / 3) * 100),
            w: Math.max(90, Number(e.width || 170)),
            h: Math.max(44, Number(e.height || 58)),
            label: String(e.text || e.label || e.id || `Node ${i + 1}`),
          });
        }
      }
      return { format: "excalidraw", nodes, edges };
    }
    if (Array.isArray(obj.nodes)) {
      const nodes = obj.nodes.map((n, i) => ({
        id: n.id || `n-${i + 1}`,
        shape: n.color === "yellow" ? "sticky" : "rectangle",
        x: Number(n.x ?? 40 + (i % 3) * 210),
        y: Number(n.y ?? 40 + Math.floor(i / 3) * 100),
        w: Math.max(90, Number(n.width || 170)),
        h: Math.max(44, Number(n.height || 62)),
        label: String(n.text || n.file || n.id || `Card ${i + 1}`),
      }));
      const edges = (Array.isArray(obj.edges) ? obj.edges : []).map((ed, i) => ({
        id: ed.id || `edge-${i + 1}`,
        fromId: ed.fromNode || null,
        toId: ed.toNode || null,
        label: String(ed.label || ""),
      }));
      return { format: "canvas", nodes, edges };
    }
  } catch {}

  // Mermaid flowchart parser (`A[Client] --> B{Gateway}`)
  const nodeMap = new Map();
  const edges = [];
  const ensureNode = (rawToken) => {
    const m = /^([A-Za-z0-9_.-]+)\s*(?:\[\(([^)]+)\)\]|\{([^}]+)\}|\[([^\]]+)\]|\(([^)]+)\))?$/.exec(rawToken.trim());
    if (!m) return null;
    const id = m[1];
    const shape = m[2] ? "database" : m[3] ? "diamond" : "rectangle";
    const label = m[2] || m[3] || m[4] || m[5] || id;
    if (!nodeMap.has(id)) {
      const idx = nodeMap.size;
      nodeMap.set(id, {
        id,
        shape,
        x: 40 + (idx % 3) * 230,
        y: 50 + Math.floor(idx / 3) * 120,
        w: Math.max(140, Math.min(240, label.length * 8 + 32)),
        h: 58,
        label,
      });
    } else if (m[2] || m[3] || m[4] || m[5]) {
      const prev = nodeMap.get(id);
      prev.label = label;
      prev.shape = shape;
    }
    return id;
  };

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%%") || /^(flowchart|graph)\s+/i.test(trimmed)) continue;
    const arrow = /^(.+?)\s*(?:-->|-.->|==>)\s*(?:\|([^|]+)\|\s*)?(.+)$/.exec(trimmed);
    if (arrow) {
      const fromId = ensureNode(arrow[1]);
      const toId = ensureNode(arrow[3]);
      if (fromId && toId) {
        edges.push({ id: `e-${edges.length + 1}`, fromId, toId, label: (arrow[2] || "").trim() });
      }
    } else {
      ensureNode(trimmed);
    }
  }

  return { format: "mermaid", nodes: [...nodeMap.values()], edges };
}

export function serializeDiagramSource(format, nodes, edges) {
  if (format === "canvas") {
    return JSON.stringify(
      {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: "text",
          x: n.x,
          y: n.y,
          width: n.w,
          height: n.h,
          text: n.label,
          ...(n.shape === "sticky" ? { color: "yellow" } : {}),
        })),
        edges: edges
          .filter((e) => e.fromId && e.toId)
          .map((e) => ({ id: e.id, fromNode: e.fromId, toNode: e.toId, label: e.label || "" })),
      },
      null,
      2
    );
  }
  if (format === "mermaid") {
    const lines = ["flowchart LR"];
    const fmt = (n) => {
      const safe = n.label.replace(/[\[\]{}()]/g, "");
      if (n.shape === "database") return `${n.id}[(${safe})]`;
      if (n.shape === "diamond") return `${n.id}{${safe}}`;
      return `${n.id}[${safe}]`;
    };
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const used = new Set();
    for (const e of edges) {
      const a = byId.get(e.fromId);
      const b = byId.get(e.toId);
      if (!a || !b) continue;
      used.add(a.id);
      used.add(b.id);
      const lbl = e.label ? `|${e.label}| ` : "";
      lines.push(`  ${fmt(a)} --> ${lbl}${fmt(b)}`);
    }
    for (const n of nodes) {
      if (!used.has(n.id)) lines.push(`  ${fmt(n)}`);
    }
    return lines.join("\n") + "\n";
  }
  // Excalidraw v2 JSON
  const elements = [
    ...nodes.map((n) => ({
      id: n.id,
      type: n.shape,
      x: n.x,
      y: n.y,
      width: n.w,
      height: n.h,
      text: n.label,
    })),
    ...edges.map((e) => ({
      id: e.id,
      type: "arrow",
      fromId: e.fromId || undefined,
      toId: e.toId || undefined,
      x: e.x1 ?? 40,
      y: e.y1 ?? 40,
      x2: e.x2 ?? 200,
      y2: e.y2 ?? 40,
      label: e.label || undefined,
    })),
  ];
  return JSON.stringify({ type: "excalidraw", version: 2, elements }, null, 2);
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
      const id = `diagram-${Date.now()}-${seq++}`;
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

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

if (typeof document !== "undefined" && document.getElementById("canvas")) {
  const $ = (id) => document.getElementById(id);
  const svgCanvas = $("canvas");
  const sourceEl = $("source");
  const statusEl = $("status");
  const zoomLabelEl = $("zoomLabel");
  const nodeStatsEl = $("nodeStats");
  const formatBadgeEl = $("formatBadge");
  const conflictBanner = $("conflictBanner");

  const setBtnIcon = (id, icon, text) => {
    const b = $(id);
    if (!b) return;
    b.replaceChildren(createIcon(icon, 13));
    if (text) {
      const sp = document.createElement("span");
      sp.textContent = text;
      b.appendChild(sp);
    }
  };
  setBtnIcon("btnAddRect", "box", "Box");
  setBtnIcon("btnAddDiamond", "diamond", "Decision");
  setBtnIcon("btnAddDb", "database", "DB");
  setBtnIcon("btnAddSticky", "sticky", "Sticky");
  setBtnIcon("btnConnect", "arrow", "Connect");
  setBtnIcon("btnDelete", "trash", "");
  setBtnIcon("btnUndo", "undo", "");
  setBtnIcon("btnRedo", "redo", "");
  setBtnIcon("btnZoomOut", "zoomOut", "");
  setBtnIcon("btnZoomIn", "zoomIn", "");
  setBtnIcon("btnThemeBg", "sun", "BG");
  setBtnIcon("btnExport", "download", "SVG");
  setBtnIcon("btnSave", "save", "Save");

  const state = {
    fileName: "diagram.excalidraw",
    format: "excalidraw",
    mtimeMs: null,
    nodes: [],
    edges: [],
    selectedId: null,
    lightBg: false,
    zoom: 1,
    panX: 0,
    panY: 0,
    undoStack: [],
    redoStack: [],
    loadGen: 0,
  };

  function pushHistory() {
    state.undoStack.push(JSON.stringify({ nodes: state.nodes, edges: state.edges }));
    if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
    state.redoStack = [];
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    $("btnUndo").disabled = state.undoStack.length === 0;
    $("btnRedo").disabled = state.redoStack.length === 0;
    $("btnDelete").disabled = !state.selectedId;
  }

  function syncSource() {
    sourceEl.value = serializeDiagramSource(state.format, state.nodes, state.edges);
  }

  function computeEdgeCoords(edge, nodeMap) {
    const from = edge.fromId ? nodeMap.get(edge.fromId) : null;
    const to = edge.toId ? nodeMap.get(edge.toId) : null;
    if (from && to) {
      const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
      const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
      if (Math.abs(tc.x - fc.x) >= Math.abs(tc.y - fc.y)) {
        const right = tc.x >= fc.x;
        return {
          x1: right ? from.x + from.w : from.x,
          y1: fc.y,
          x2: right ? to.x : to.x + to.w,
          y2: tc.y,
        };
      }
      const down = tc.y >= fc.y;
      return {
        x1: fc.x,
        y1: down ? from.y + from.h : from.y,
        x2: tc.x,
        y2: down ? to.y : to.y + to.h,
      };
    }
    return { x1: edge.x1 ?? 40, y1: edge.y1 ?? 40, x2: edge.x2 ?? 200, y2: edge.y2 ?? 40 };
  }

  function renderCanvas() {
    const vbW = Math.round(760 / state.zoom);
    const vbH = Math.round(460 / state.zoom);
    svgCanvas.setAttribute("viewBox", `${state.panX} ${state.panY} ${vbW} ${vbH}`);
    svgCanvas.style.background = state.lightBg ? "#f8fafc" : "#0b0f17";
    zoomLabelEl.textContent = `${Math.round(state.zoom * 100)}%`;
    nodeStatsEl.textContent = `${state.nodes.length} nodes · ${state.edges.length} edges`;
    formatBadgeEl.textContent = state.format;

    const stroke = "#38bdf8";
    const fg = state.lightBg ? "#0f172a" : "#e6edf3";
    const cardFill = state.lightBg ? "#ffffff" : "#172033";

    const defs = svgEl("defs");
    const marker = svgEl("marker", {
      id: "arrowhead",
      markerWidth: 9,
      markerHeight: 7,
      refX: 8,
      refY: 3.5,
      orient: "auto",
    });
    marker.appendChild(svgEl("polygon", { points: "0 0, 9 3.5, 0 7", fill: stroke }));
    defs.appendChild(marker);

    const gridPattern = svgEl("pattern", {
      id: "dotgrid",
      width: 20,
      height: 20,
      patternUnits: "userSpaceOnUse",
    });
    gridPattern.appendChild(
      svgEl("circle", {
        cx: 1,
        cy: 1,
        r: 1,
        fill: state.lightBg ? "#cbd5e1" : "#1f293d",
      })
    );
    defs.appendChild(gridPattern);

    const children = [
      defs,
      svgEl("rect", {
        x: state.panX - 1000,
        y: state.panY - 1000,
        width: vbW + 2000,
        height: vbH + 2000,
        fill: "url(#dotgrid)",
      }),
    ];

    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
    for (const edge of state.edges) {
      const c = computeEdgeCoords(edge, nodeMap);
      children.push(
        svgEl("line", {
          x1: c.x1,
          y1: c.y1,
          x2: c.x2,
          y2: c.y2,
          stroke,
          "stroke-width": "2",
          "marker-end": "url(#arrowhead)",
        })
      );
      if (edge.label) {
        const lbl = svgEl("text", {
          x: (c.x1 + c.x2) / 2,
          y: (c.y1 + c.y2) / 2 - 6,
          fill: fg,
          style: "font-size: var(--font-size-toolbar, 12px)",
          "text-anchor": "middle",
        });
        lbl.textContent = edge.label;
        children.push(lbl);
      }
    }

    for (const n of state.nodes) {
      const g = svgEl("g", {
        class: `node-group${state.selectedId === n.id ? " selected" : ""}`,
        "data-node-id": n.id,
      });

      const fill = n.shape === "sticky" ? "#fef08a" : cardFill;
      const textFill = n.shape === "sticky" ? "#1e293b" : fg;
      const shapeStroke = n.shape === "sticky" ? "#eab308" : n.shape === "database" ? "#34d399" : stroke;

      if (n.shape === "diamond") {
        const cx = n.x + n.w / 2;
        const cy = n.y + n.h / 2;
        g.appendChild(
          svgEl("polygon", {
            class: "node-shape",
            points: `${cx},${n.y} ${n.x + n.w},${cy} ${cx},${n.y + n.h} ${n.x},${cy}`,
            fill,
            stroke: shapeStroke,
            "stroke-width": "1.6",
          })
        );
      } else if (n.shape === "database") {
        g.appendChild(
          svgEl("rect", {
            class: "node-shape",
            x: n.x,
            y: n.y + 8,
            width: n.w,
            height: n.h - 14,
            rx: 6,
            fill,
            stroke: shapeStroke,
            "stroke-width": "1.6",
          })
        );
        g.appendChild(
          svgEl("ellipse", {
            cx: n.x + n.w / 2,
            cy: n.y + 10,
            rx: n.w / 2,
            ry: 8,
            fill,
            stroke: shapeStroke,
            "stroke-width": "1.6",
          })
        );
      } else {
        g.appendChild(
          svgEl("rect", {
            class: "node-shape",
            x: n.x,
            y: n.y,
            width: n.w,
            height: n.h,
            rx: n.shape === "sticky" ? 3 : 8,
            fill,
            stroke: shapeStroke,
            "stroke-width": "1.6",
          })
        );
      }

      const txt = svgEl("text", {
        x: n.x + n.w / 2,
        y: n.y + n.h / 2 + 4,
        fill: textFill,
        style: "font-size: var(--font-size-toolbar, 12px)",
        "font-weight": "600",
        "text-anchor": "middle",
      });
      txt.textContent = n.label.slice(0, 38);
      g.appendChild(txt);
      children.push(g);
    }

    svgCanvas.replaceChildren(...children);
    updateHistoryButtons();
  }

  // Dragging nodes on SVG canvas
  let dragState = null;
  function clientToSvg(clientX, clientY) {
    const rect = svgCanvas.getBoundingClientRect();
    const vbW = 760 / state.zoom;
    const vbH = 460 / state.zoom;
    return {
      x: state.panX + ((clientX - rect.left) / rect.width) * vbW,
      y: state.panY + ((clientY - rect.top) / rect.height) * vbH,
    };
  }

  svgCanvas.addEventListener("pointerdown", (e) => {
    const group = e.target.closest?.(".node-group");
    if (group) {
      const id = group.getAttribute("data-node-id");
      const node = state.nodes.find((n) => n.id === id);
      if (!node) return;
      state.selectedId = id;
      const pt = clientToSvg(e.clientX, e.clientY);
      pushHistory();
      dragState = { mode: "node", node, offsetX: pt.x - node.x, offsetY: pt.y - node.y };
      svgCanvas.classList.add("dragging");
      svgCanvas.setPointerCapture(e.pointerId);
      renderCanvas();
    } else {
      state.selectedId = null;
      dragState = { mode: "pan", startX: e.clientX, startY: e.clientY, origPanX: state.panX, origPanY: state.panY };
      svgCanvas.classList.add("dragging");
      svgCanvas.setPointerCapture(e.pointerId);
      renderCanvas();
    }
  });

  svgCanvas.addEventListener("pointermove", (e) => {
    if (!dragState) return;
    if (dragState.mode === "node") {
      const pt = clientToSvg(e.clientX, e.clientY);
      dragState.node.x = snap(pt.x - dragState.offsetX);
      dragState.node.y = snap(pt.y - dragState.offsetY);
      renderCanvas();
    } else if (dragState.mode === "pan") {
      const rect = svgCanvas.getBoundingClientRect();
      const dx = ((e.clientX - dragState.startX) / rect.width) * (760 / state.zoom);
      const dy = ((e.clientY - dragState.startY) / rect.height) * (460 / state.zoom);
      state.panX = Math.round(dragState.origPanX - dx);
      state.panY = Math.round(dragState.origPanY - dy);
      renderCanvas();
    }
  });

  svgCanvas.addEventListener("pointerup", () => {
    if (!dragState) return;
    if (dragState.mode === "node") syncSource();
    dragState = null;
    svgCanvas.classList.remove("dragging");
  });

  // Double-click node to rename inline
  svgCanvas.addEventListener("dblclick", (e) => {
    const group = e.target.closest?.(".node-group");
    if (!group) return;
    const id = group.getAttribute("data-node-id");
    const node = state.nodes.find((n) => n.id === id);
    if (!node) return;
    const wrap = $("canvasWrap");
    const existing = wrap.querySelector(".inline-editor");
    if (existing) existing.remove();
    const input = document.createElement("input");
    input.className = "inline-editor";
    input.value = node.label;
    input.style.left = "16px";
    input.style.top = "16px";
    input.style.width = "240px";
    const commit = () => {
      const next = input.value.trim();
      if (next && next !== node.label) {
        pushHistory();
        node.label = next;
        node.w = Math.max(node.w, Math.min(280, next.length * 8 + 36));
        syncSource();
        renderCanvas();
      }
      input.remove();
    };
    input.addEventListener("keydown", (ke) => {
      if (ke.key === "Enter") commit();
      else if (ke.key === "Escape") input.remove();
    });
    input.addEventListener("blur", commit);
    wrap.appendChild(input);
    input.focus();
    input.select();
  });

  svgCanvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    state.zoom = Math.max(0.4, Math.min(2.4, state.zoom + (e.deltaY < 0 ? 0.1 : -0.1)));
    renderCanvas();
  }, { passive: false });

  function addNode(shape, prefix) {
    pushHistory();
    const n = state.nodes.length + 1;
    const node = {
      id: `el-${Date.now().toString(36)}-${n}`,
      shape,
      x: snap(50 + ((n * 40) % 440)),
      y: snap(50 + ((n * 30) % 260)),
      w: shape === "sticky" ? 180 : 170,
      h: shape === "diamond" ? 72 : 58,
      label: `${prefix} ${n}`,
    };
    state.nodes.push(node);
    state.selectedId = node.id;
    syncSource();
    renderCanvas();
  }

  $("btnAddRect").onclick = () => addNode("rectangle", "Service");
  $("btnAddDiamond").onclick = () => addNode("diamond", "Check");
  $("btnAddDb").onclick = () => addNode("database", "Store");
  $("btnAddSticky").onclick = () => addNode("sticky", "Note");
  $("btnConnect").onclick = () => {
    if (state.nodes.length < 2) return;
    pushHistory();
    const fromIdx = state.selectedId ? state.nodes.findIndex((n) => n.id === state.selectedId) : state.nodes.length - 2;
    const from = state.nodes[Math.max(0, fromIdx)];
    const to = state.nodes[(Math.max(0, fromIdx) + 1) % state.nodes.length];
    if (from && to && from.id !== to.id) {
      state.edges.push({ id: `edge-${Date.now().toString(36)}`, fromId: from.id, toId: to.id, label: "" });
      syncSource();
      renderCanvas();
    }
  };
  $("btnDelete").onclick = () => {
    if (!state.selectedId) return;
    pushHistory();
    state.nodes = state.nodes.filter((n) => n.id !== state.selectedId);
    state.edges = state.edges.filter((e) => e.fromId !== state.selectedId && e.toId !== state.selectedId);
    state.selectedId = null;
    syncSource();
    renderCanvas();
  };
  $("btnUndo").onclick = () => {
    if (!state.undoStack.length) return;
    state.redoStack.push(JSON.stringify({ nodes: state.nodes, edges: state.edges }));
    const prev = JSON.parse(state.undoStack.pop());
    state.nodes = prev.nodes;
    state.edges = prev.edges;
    syncSource();
    renderCanvas();
  };
  $("btnRedo").onclick = () => {
    if (!state.redoStack.length) return;
    state.undoStack.push(JSON.stringify({ nodes: state.nodes, edges: state.edges }));
    const next = JSON.parse(state.redoStack.pop());
    state.nodes = next.nodes;
    state.edges = next.edges;
    syncSource();
    renderCanvas();
  };
  $("btnZoomIn").onclick = () => { state.zoom = Math.min(2.4, state.zoom + 0.15); renderCanvas(); };
  $("btnZoomOut").onclick = () => { state.zoom = Math.max(0.4, state.zoom - 0.15); renderCanvas(); };
  $("btnThemeBg").onclick = () => { state.lightBg = !state.lightBg; renderCanvas(); };

  window.addEventListener("keydown", (e) => {
    if (document.activeElement === sourceEl) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) $("btnRedo").click();
      else $("btnUndo").click();
    } else if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId) {
      $("btnDelete").click();
    }
  });

  const bridge = createBridge({ onOpenedFileChanged: () => loadFile() });

  async function loadFile() {
    const gen = ++state.loadGen;
    try {
      const res = await bridge.call("editor:readOpenedFile", {});
      if (gen !== state.loadGen) return;
      state.fileName = res.fileName || "diagram.excalidraw";
      state.mtimeMs = res.mtimeMs ?? null;
      conflictBanner.hidden = true;
      $("title").textContent = `Diagram Studio — ${state.fileName}`;
      sourceEl.value = res.content || "";
      const parsed = parseDiagramSource(sourceEl.value);
      state.format = state.fileName.endsWith(".mmd") || state.fileName.endsWith(".mermaid")
        ? "mermaid"
        : state.fileName.endsWith(".canvas")
          ? "canvas"
          : parsed.format;
      state.nodes = parsed.nodes;
      state.edges = parsed.edges;
      state.undoStack = [];
      state.redoStack = [];
      renderCanvas();
      statusEl.textContent = `Loaded ${state.fileName} (${res.byteLength} B)`;
    } catch (err) {
      statusEl.textContent = err.message;
    }
  }

  $("btnReloadDisk").onclick = loadFile;
  $("btnExport").onclick = async () => {
    const serializer = new XMLSerializer();
    const svgOut = serializer.serializeToString(svgCanvas);
    await bridge.call("files:exportCopy", {
      fileName: `${state.fileName}.svg`,
      mimeType: "image/svg+xml",
      content: svgOut,
    });
    statusEl.textContent = "Exported vector SVG";
  };
  $("btnSave").onclick = async () => {
    try {
      const res = await bridge.call("editor:saveOpenedFile", {
        content: sourceEl.value,
        encoding: "utf-8",
        expectedMtimeMs: state.mtimeMs,
      });
      state.mtimeMs = res.mtimeMs;
      conflictBanner.hidden = true;
      statusEl.textContent = `Saved atomically (${res.byteLength} B)`;
    } catch (err) {
      if (err.code === "FILE_MODIFIED_EXTERNALLY") {
        conflictBanner.hidden = false;
        statusEl.textContent = "Save blocked: file changed externally (HTTP 409)";
      } else {
        statusEl.textContent = err.message;
      }
    }
  };

  sourceEl.addEventListener("input", () => {
    const parsed = parseDiagramSource(sourceEl.value);
    state.nodes = parsed.nodes;
    state.edges = parsed.edges;
    renderCanvas();
  });

  bridge.call("plugin:ready", {}).then(() => {
    bridge.call("theme:subscribe", {}).catch(() => {});
    loadFile();
  });
}
