function createBridge(handlers) {
  let seq = 1;
  const pending = new Map();
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0") return;
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      clearTimeout(timer); pending.delete(msg.id);
      if (msg.error) { const err = new Error(msg.error.message || "RPC error"); err.code = msg.error.data?.code || msg.error.code; reject(err); }
      else resolve(msg.result);
      return;
    }
    if (msg.method === "theme:variables") {
      for (const [k, v] of Object.entries(msg.params?.variables || {})) document.documentElement.style.setProperty(k, String(v));
      handlers?.onTheme?.(msg.params?.variables || {});
    } else if (msg.method === "traces:snapshot") handlers?.onTraces?.(msg.params || {});
  });
  function call(method, params = {}, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const id = "rpc-" + Date.now() + "-" + seq++;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("RPC timeout: " + method)); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
    });
  }
  return { call };
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

let traces = []; let history = {}; let lastSavedSig = ""; let saveTimer = null;
const statsEl = document.getElementById("stats"); const logEl = document.getElementById("log");
const bridge = createBridge({ onTraces: (p) => { traces = p.traces || []; updateView(); } });
function persistHistory() {
  const pruned = Object.fromEntries(Object.entries(history).sort().reverse().slice(0, 30));
  history = pruned;
  const sig = JSON.stringify(history);
  if (sig === lastSavedSig) return;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    lastSavedSig = JSON.stringify(history);
    bridge.call("storage:set", { key: "history", value: history }).catch(() => {});
  }, 1500);
}
function updateView() {
  const activeMins = Math.round(traces.reduce((acc, t) => acc + Number(t.elapsedMs || 0), 0) / 60000);
  const totalTokens = traces.reduce((acc, t) => acc + Number(t.totalTokens || 0), 0);
  const todayKey = new Date().toISOString().slice(0, 10);
  history[todayKey] = { minutes: Math.max(activeMins, history[todayKey]?.minutes || 0), tokens: totalTokens, sessions: traces.length };
  persistHistory();
  bridge.call("statusBar:update", { itemId: "today-time", text: "Today: " + history[todayKey].minutes + "m" }).catch(() => {});
  statsEl.innerHTML = '<div class="card"><strong>' + todayKey + '</strong><div class="muted" style="margin-top:4px;">Active Minutes: ' + history[todayKey].minutes + 'm · Sessions: ' + traces.length + ' · Tokens: ' + totalTokens.toLocaleString() + '</div></div>';
  logEl.innerHTML = '<div class="card"><strong>Recent Days</strong>' + Object.entries(history).sort().reverse().slice(0, 14).map(([d, v]) => '<div class="row muted" style="margin-top:3px;"><span class="mono">' + esc(d) + '</span><span>' + v.minutes + 'm · ' + v.sessions + ' sessions</span></div>').join("") + '</div>';
}
document.getElementById("btnExport").onclick = async () => {
  const md = "# AGMon Daily Worklog\n\n" + Object.entries(history).sort().reverse().map(([d, v]) => "- **" + d + "**: " + v.minutes + " min (" + v.sessions + " sessions, " + (v.tokens || 0) + " tokens)").join("\n") + "\n";
  await bridge.call("files:exportCopy", { fileName: "worklog.md", mimeType: "text/markdown", content: md });
};
bridge.call("plugin:ready", {}).then(async () => {
  bridge.call("theme:subscribe", {}).catch(() => {});
  const st = await bridge.call("storage:get", {}).catch(() => ({ storage: {} }));
  history = st?.storage?.history && typeof st.storage.history === "object" ? st.storage.history : {};
  const tr = await bridge.call("traces:subscribe", {}).catch(() => ({ traces: [] }));
  traces = tr?.traces || []; updateView();
});
