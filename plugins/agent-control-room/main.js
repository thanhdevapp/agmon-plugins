import { createIcon } from "./icons.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const WAITING_STATES = new Set(["waiting", "blocked", "needs_input"]);

export function computePitwallSummary(traces) {
  const list = Array.isArray(traces) ? traces : [];
  const waiting = list.filter((t) => WAITING_STATES.has(String(t.state || "").toLowerCase()));
  const working = list.filter((t) => ["busy", "streaming", "running"].includes(String(t.state || "").toLowerCase()));
  const totalTokens = list.reduce((sum, t) => sum + Number(t.totalTokens || 0), 0);
  const totalSubagents = list.reduce((sum, t) => sum + (Array.isArray(t.subagents) ? t.subagents.length : 0), 0);
  return {
    totalAgents: list.length,
    waitingCount: waiting.length,
    workingCount: working.length,
    totalTokens,
    totalSubagents,
  };
}

export function buildDagLayout(traces) {
  const list = (Array.isArray(traces) ? traces : []).slice(0, 6);
  const nodes = [];
  const edges = [];
  const colW = Math.max(140, Math.floor(540 / Math.max(1, list.length)));

  list.forEach((t, idx) => {
    const x = 14 + idx * colW;
    const parentId = t.connectionId || `agent-${idx}`;
    const state = String(t.state || "idle").toLowerCase();
    nodes.push({
      id: parentId,
      label: String(t.sessionTitle || t.account || parentId).slice(0, 20),
      sub: `${t.cli || t.provider || "agent"} · ${state}`,
      x,
      y: 12,
      w: colW - 18,
      h: 44,
      state,
      isSubagent: false,
    });
    const subs = Array.isArray(t.subagents) ? t.subagents.slice(0, 2) : [];
    subs.forEach((s, sIdx) => {
      const sx = x + sIdx * Math.floor((colW - 14) / Math.max(1, subs.length));
      const sw = Math.max(66, Math.floor((colW - 22) / Math.max(1, subs.length)));
      const subId = `${parentId}-sub-${sIdx}`;
      nodes.push({
        id: subId,
        label: String(s?.role || s?.id || `sub-${sIdx + 1}`).slice(0, 12),
        sub: "subagent",
        x: sx,
        y: 88,
        w: sw,
        h: 36,
        state: "running",
        isSubagent: true,
      });
      edges.push({ x1: x + (colW - 18) / 2, y1: 56, x2: sx + sw / 2, y2: 88 });
    });
  });
  return { nodes, edges };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
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
    } else if (msg.method === "traces:snapshot") {
      handlers?.onTraces?.(msg.params || {});
    }
  });
  function call(method, params = {}, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      const id = `ctrl-${Date.now()}-${seq++}`;
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

if (typeof document !== "undefined" && document.getElementById("dagSvg")) {
  const $ = (id) => document.getElementById(id);
  $("btnRefresh").replaceChildren(createIcon("refresh", 13), el("span", "", "Refresh"));

  let latestTraces = [];
  let activeFilter = "all";
  let metricsGen = 0;

  const bridge = createBridge({
    onTraces: (p) => {
      latestTraces = p.traces || [];
      renderAll();
    },
  });

  function renderDag() {
    const { nodes, edges } = buildDagLayout(latestTraces);
    $("dagBadge").textContent = `${nodes.length} nodes · ${edges.length} links`;
    const children = [];
    for (const edge of edges) {
      children.push(
        svgEl("path", {
          d: `M${edge.x1} ${edge.y1} C ${edge.x1} ${(edge.y1 + edge.y2) / 2}, ${edge.x2} ${(edge.y1 + edge.y2) / 2}, ${edge.x2} ${edge.y2}`,
          fill: "none",
          stroke: "#38bdf8",
          "stroke-width": "1.6",
          "stroke-opacity": "0.75",
        })
      );
    }
    for (const n of nodes) {
      const stroke = WAITING_STATES.has(n.state) ? "#fbbf24" : n.isSubagent ? "#a78bfa" : "#34d399";
      const g = svgEl("g");
      g.appendChild(
        svgEl("rect", {
          x: n.x,
          y: n.y,
          width: n.w,
          height: n.h,
          rx: 7,
          fill: "#161b26",
          stroke,
          "stroke-width": "1.5",
        })
      );
      g.appendChild(svgEl("circle", { cx: n.x + 11, cy: n.y + 15, r: 3.5, fill: stroke }));
      const t1 = svgEl("text", { x: n.x + 20, y: n.y + 19, fill: "#e6edf3", "font-size": "10.5", "font-weight": "700" });
      t1.textContent = n.label;
      const t2 = svgEl("text", { x: n.x + 10, y: n.y + 33, fill: "#8b949e", "font-size": "9.5" });
      t2.textContent = n.sub;
      g.append(t1, t2);
      children.push(g);
    }
    $("dagSvg").replaceChildren(...children);
  }

  function renderAll() {
    const sum = computePitwallSummary(latestTraces);
    $("summary").textContent = `${sum.totalAgents} agents · ${sum.waitingCount} waiting · ${(sum.totalTokens / 1000).toFixed(1)}k tok`;
    bridge.call("statusBar:update", { itemId: "inbox-count", text: `Inbox: ${sum.waitingCount}` }).catch(() => {});

    // 1. Decision Gate Inbox
    const inboxSec = $("inbox");
    const waiting = latestTraces.filter((t) => WAITING_STATES.has(String(t.state || "").toLowerCase()));
    const inboxTitle = el("div", "card-title");
    inboxTitle.append(el("span", "", `Decision Gate Inbox (${waiting.length})`), el("span", waiting.length ? "badge warn" : "badge ok", waiting.length ? "Action Needed" : "All Clear"));
    const inboxChildren = [inboxTitle];
    if (!waiting.length) {
      inboxChildren.push(el("div", "muted", "All clear. No agents are currently waiting for human approval."));
    } else {
      for (const t of waiting) {
        const row = el("div", "agent-row row");
        const left = el("div");
        left.append(
          el("div", "", String(t.sessionTitle || t.account || t.connectionId)),
          el("div", "muted mono", `${t.cli || t.provider || "agent"} · tool: ${t.activeTool || "approval"}`)
        );
        const btn = el("button", "btn primary");
        btn.replaceChildren(createIcon("focus", 12), el("span", "", "Focus"));
        btn.onclick = () => bridge.call("workbench:openSession", { session: t.connectionId }).catch(() => {});
        row.append(left, btn);
        inboxChildren.push(row);
      }
    }
    inboxSec.replaceChildren(...inboxChildren);

    // 2. Live Subagent DAG
    renderDag();

    // 3. Pitwall & Token Burn Meters
    const filtered = latestTraces.filter((t) => {
      const st = String(t.state || "").toLowerCase();
      if (activeFilter === "waiting") return WAITING_STATES.has(st);
      if (activeFilter === "active") return ["busy", "streaming", "running"].includes(st);
      return true;
    });
    const agentsSec = $("agents");
    const aTitle = el("div", "card-title");
    aTitle.append(
      el("span", "", `Live Pitwall & Context Burn (${filtered.length})`),
      el("span", "badge", `Total: ${sum.totalTokens.toLocaleString()} tokens · ${sum.totalSubagents} subagents`)
    );
    const aChildren = [aTitle];
    if (!filtered.length) {
      aChildren.push(el("div", "muted", "No agent sessions match this filter."));
    } else {
      for (const t of filtered) {
        const pct = Math.min(100, Math.round((Number(t.totalTokens || 0) / 250000) * 100));
        const st = String(t.state || "idle").toLowerCase();
        const box = el("div", "agent-row");
        const top = el("div", "row");
        top.append(
          el("strong", "", String(t.sessionTitle || t.account || t.connectionId)),
          el("span", WAITING_STATES.has(st) ? "badge warn" : "badge ok", `${t.cli || t.provider || "agent"} · ${st}`)
        );
        const sub = el(
          "div",
          "muted mono",
          `Tokens: ${Number(t.totalTokens || 0).toLocaleString()} (${pct}% est ctx) · Steps: ${t.requestCount || 0} · Subagents: ${t.subagents?.length || 0}`
        );
        const track = el("div", "meter-track");
        const fill = el("div", "meter-fill");
        fill.style.width = `${Math.max(4, pct)}%`;
        fill.style.background = pct > 80 ? "#f87171" : pct > 55 ? "#fbbf24" : "#38bdf8";
        track.appendChild(fill);
        box.append(top, sub, track);
        aChildren.push(box);
      }
    }
    agentsSec.replaceChildren(...aChildren);
  }

  async function loadMetrics() {
    const gen = ++metricsGen;
    try {
      const res = await bridge.call("analytics:getSkillMcpMetrics", {});
      if (gen !== metricsGen) return;
      const m = res.metrics || {};
      const sec = $("metrics");
      const title = el("div", "card-title");
      title.append(
        el("span", "", "Skill, MCP & Plugin Ecosystem Telemetry"),
        el("span", "badge ok", `${m.plugins?.enabled || 0}/${m.plugins?.total || 0} plugins enabled`)
      );
      const bars = [
        { label: "Workspace Skills", val: Number(m.skillsCount || 0), max: Math.max(20, Number(m.skillsCount || 0)) },
        { label: "MCP Servers", val: Number(m.mcpServersCount || 0), max: Math.max(10, Number(m.mcpServersCount || 0)) },
        { label: "Enabled Plugins", val: Number(m.plugins?.enabled || 0), max: Math.max(1, Number(m.plugins?.total || 38)) },
      ];
      const children = [title];
      for (const b of bars) {
        const r = el("div", "bar-row");
        const lbl = el("span", "muted", b.label);
        lbl.style.width = "125px";
        const tr = el("div", "bar-track");
        const fl = el("div", "bar-fill");
        fl.style.width = `${Math.min(100, Math.round((b.val / b.max) * 100))}%`;
        tr.appendChild(fl);
        const num = el("span", "mono", String(b.val));
        num.style.width = "36px";
        num.style.textAlign = "right";
        r.append(lbl, tr, num);
        children.push(r);
      }
      sec.replaceChildren(...children);
    } catch (err) {
      $("metrics").replaceChildren(el("div", "muted", err.message));
    }
  }

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderAll();
    };
  });
  $("btnRefresh").onclick = loadMetrics;

  bridge.call("plugin:ready", {}).then(() => {
    bridge.call("theme:subscribe", {}).catch(() => {});
    bridge.call("traces:subscribe", {}).then((r) => {
      latestTraces = r?.traces || [];
      renderAll();
    }).catch(() => {});
    loadMetrics();
  });
}
