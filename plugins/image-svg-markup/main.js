import { createIcon } from "./icons.js";

export const MARKUP_COLORS = [
  "#f43f5e",
  "#f59e0b",
  "#22c55e",
  "#38bdf8",
  "#a855f7",
  "#ec4899",
  "#ffffff",
  "#111827",
];

/**
 * Immutable scene helpers inspired by structured annotation editors:
 * deleting a numbered step automatically renumbers remaining step discs 1..N.
 */
export function renumberSteps(shapes) {
  let step = 1;
  return (shapes || []).map((s) => (s.t === "step" ? { ...s, n: step++ } : s));
}

export function addShape(shapes, shape) {
  const next = [...(shapes || []), shape];
  return shape.t === "step" ? renumberSteps(next) : next;
}

export function removeShapeAt(shapes, idx) {
  const next = (shapes || []).filter((_, i) => i !== idx);
  return renumberSteps(next);
}

export function snapAngle45(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x2: x1 + Math.cos(angle) * len, y2: y1 + Math.sin(angle) * len };
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
      const id = `img-${Date.now()}-${seq++}`;
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

if (typeof document !== "undefined" && document.getElementById("stage")) {
  const $ = (id) => document.getElementById(id);
  const canvas = $("stage");
  const ctx = canvas.getContext("2d");
  const statusEl = $("status");

  const TOOLS = [
    { id: "box", key: "r", label: "Box", icon: "box" },
    { id: "ellipse", key: "o", label: "Ellipse", icon: "ellipse" },
    { id: "arrow", key: "a", label: "Arrow", icon: "arrow" },
    { id: "pen", key: "p", label: "Pen", icon: "pen" },
    { id: "highlighter", key: "h", label: "Highlight", icon: "highlighter" },
    { id: "step", key: "n", label: "Step", icon: "step" },
    { id: "text", key: "t", label: "Text", icon: "text" },
    { id: "redact", key: "x", label: "Redact", icon: "redact" },
  ];

  let activeTool = "box";
  let activeColor = MARKUP_COLORS[0];
  let baseImg = null;
  let fileName = "annotated.png";
  let shapes = [];
  let undoStack = [];
  let redoStack = [];
  let draft = null;
  let loadGen = 0;

  const toolButtonsEl = $("toolButtons");
  function renderToolButtons() {
    const frag = document.createDocumentFragment();
    for (const t of TOOLS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `btn${activeTool === t.id ? " active" : ""}`;
      b.title = `${t.label} (${t.key.toUpperCase()})`;
      b.append(createIcon(t.icon, 13), document.createTextNode(t.label));
      b.onclick = () => { activeTool = t.id; renderToolButtons(); };
      frag.appendChild(b);
    }
    toolButtonsEl.replaceChildren(frag);
  }

  const swatchesEl = $("swatches");
  function renderSwatches() {
    const frag = document.createDocumentFragment();
    MARKUP_COLORS.forEach((hex, idx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `swatch${activeColor === hex ? " active" : ""}`;
      b.style.background = hex;
      b.title = `Color ${idx + 1} (${hex})`;
      b.setAttribute("aria-label", `Color ${hex}`);
      b.onclick = () => { activeColor = hex; renderSwatches(); };
      frag.appendChild(b);
    });
    swatchesEl.replaceChildren(frag);
  }

  $("btnUndo").replaceChildren(createIcon("undo", 13));
  $("btnRedo").replaceChildren(createIcon("redo", 13));
  $("btnClear").replaceChildren(createIcon("trash", 13));
  $("btnExport").replaceChildren(createIcon("download", 13), document.createTextNode("Export PNG"));
  renderToolButtons();
  renderSwatches();

  function commitShapes(next) {
    undoStack.push(shapes);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    shapes = next;
    redraw();
  }

  function drawShape(s) {
    ctx.save();
    if (s.t === "redact") {
      ctx.fillStyle = "#000000";
      ctx.fillRect(s.x, s.y, s.w, s.h);
    } else if (s.t === "box") {
      ctx.strokeStyle = s.c;
      ctx.lineWidth = 3;
      ctx.strokeRect(s.x, s.y, s.w, s.h);
    } else if (s.t === "ellipse") {
      ctx.strokeStyle = s.c;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.t === "arrow") {
      ctx.strokeStyle = s.c;
      ctx.fillStyle = s.c;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const head = 12;
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - head * Math.cos(ang - 0.45), s.y2 - head * Math.sin(ang - 0.45));
      ctx.lineTo(s.x2 - head * Math.cos(ang + 0.45), s.y2 - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    } else if (s.t === "pen" || s.t === "highlighter") {
      ctx.strokeStyle = s.c;
      ctx.lineWidth = s.t === "highlighter" ? 16 : 3;
      ctx.globalAlpha = s.t === "highlighter" ? 0.35 : 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.stroke();
    } else if (s.t === "step") {
      ctx.fillStyle = s.c;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s.c === "#ffffff" ? "#0f172a" : "#ffffff";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(s.n), s.x, s.y);
    } else if (s.t === "text") {
      ctx.fillStyle = s.c;
      ctx.font = "bold 16px system-ui";
      ctx.fillText(s.text || "Note", s.x, s.y);
    }
    ctx.restore();
  }

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (baseImg) ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
    for (const s of shapes) drawShape(s);
    if (draft) drawShape(draft);
  }

  function pt(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  }

  canvas.addEventListener("mousedown", (e) => {
    const p = pt(e);
    if (activeTool === "step") {
      commitShapes(addShape(shapes, { t: "step", c: activeColor, x: p.x, y: p.y, n: 1 }));
      statusEl.textContent = `${shapes.length} annotation(s)`;
      return;
    }
    if (activeTool === "text") {
      const label = window.prompt("Annotation text:", "Key callout");
      if (label && label.trim()) {
        commitShapes(addShape(shapes, { t: "text", c: activeColor, x: p.x, y: p.y, text: label.trim() }));
      }
      return;
    }
    if (activeTool === "pen" || activeTool === "highlighter") {
      draft = { t: activeTool, c: activeColor, pts: [[p.x, p.y]] };
    } else if (activeTool === "arrow") {
      draft = { t: "arrow", c: activeColor, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    } else {
      draft = { t: activeTool, c: activeColor, x0: p.x, y0: p.y, x: p.x, y: p.y, w: 0, h: 0 };
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!draft) return;
    const p = pt(e);
    if (draft.t === "pen" || draft.t === "highlighter") {
      draft.pts.push([p.x, p.y]);
    } else if (draft.t === "arrow") {
      const end = e.shiftKey ? snapAngle45(draft.x1, draft.y1, p.x, p.y) : { x2: p.x, y2: p.y };
      draft.x2 = end.x2;
      draft.y2 = end.y2;
    } else {
      draft.x = Math.min(draft.x0, p.x);
      draft.y = Math.min(draft.y0, p.y);
      draft.w = Math.abs(p.x - draft.x0);
      draft.h = Math.abs(p.y - draft.y0);
    }
    redraw();
  });

  window.addEventListener("mouseup", () => {
    if (!draft) return;
    const finalized = { ...draft };
    delete finalized.x0;
    delete finalized.y0;
    draft = null;
    commitShapes(addShape(shapes, finalized));
    statusEl.textContent = `${shapes.length} annotation(s)`;
  });

  $("btnUndo").onclick = () => {
    if (!undoStack.length) return;
    redoStack.push(shapes);
    shapes = undoStack.pop();
    redraw();
  };
  $("btnRedo").onclick = () => {
    if (!redoStack.length) return;
    undoStack.push(shapes);
    shapes = redoStack.pop();
    redraw();
  };
  $("btnClear").onclick = () => {
    if (!shapes.length) return;
    commitShapes([]);
    statusEl.textContent = "Cleared annotations";
  };

  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) $("btnRedo").click();
      else $("btnUndo").click();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const toolMatch = TOOLS.find((t) => t.key === e.key.toLowerCase());
    if (toolMatch) {
      activeTool = toolMatch.id;
      renderToolButtons();
    } else if (/^[1-8]$/.test(e.key)) {
      activeColor = MARKUP_COLORS[Number(e.key) - 1];
      renderSwatches();
    }
  });

  const bridge = createBridge({ onOpenedFileChanged: () => loadFile() });
  async function loadFile() {
    const gen = ++loadGen;
    try {
      const res = await bridge.call("editor:readOpenedFile", {});
      if (gen !== loadGen) return;
      fileName = res.fileName || "image.png";
      $("title").textContent = `Markup — ${fileName}`;
      const ext = String(res.extension || ".png").toLowerCase();
      const mime = ext === ".svg" ? "image/svg+xml" : `image/${ext.replace(".", "").replace("jpg", "jpeg")}`;
      const dataUrl = res.encoding === "base64"
        ? `data:${mime};base64,${res.content}`
        : `data:${mime};charset=utf-8,${encodeURIComponent(res.content)}`;
      const img = new Image();
      img.onload = () => {
        if (gen !== loadGen) return;
        canvas.width = Math.min(1400, Math.max(480, img.naturalWidth || 840));
        canvas.height = Math.min(900, Math.max(320, img.naturalHeight || 480));
        baseImg = img;
        redraw();
        statusEl.textContent = `${canvas.width}x${canvas.height} · ${shapes.length} annotation(s)`;
      };
      img.src = dataUrl;
    } catch (err) {
      statusEl.textContent = err.message;
    }
  }

  $("btnExport").onclick = async () => {
    const b64 = canvas.toDataURL("image/png").split(",")[1];
    await bridge.call("files:exportCopy", {
      fileName: `markup-${fileName}.png`,
      mimeType: "image/png",
      encoding: "base64",
      content: b64,
    });
    statusEl.textContent = "Exported annotated PNG";
  };

  bridge.call("plugin:ready", {}).then(() => {
    bridge.call("theme:subscribe", {}).catch(() => {});
    loadFile();
  });
}
