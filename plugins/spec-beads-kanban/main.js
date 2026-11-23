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

const bridge = createBridge({}); const markersEl = document.getElementById("markers"); const tasksEl = document.getElementById("tasks");
async function refresh() {
  try {
    const h = await bridge.call("workspace:scanHygiene", {});
    const boards = h.hygiene?.detectedBoards || [];
    markersEl.innerHTML = '<div class="card"><strong>Detected Spec &amp; Task Frameworks</strong><div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">' + (boards.length ? boards.map((b) => '<span class="badge">' + esc(b) + '</span>').join("") : '<span class="muted">No .specify / openspec / .beads folder found in workspace.</span>') + '</div></div>';
  } catch (err) { markersEl.innerHTML = '<div class="card muted">' + esc(err.message) + '</div>'; }
  try {
    const t = await bridge.call("tasks:list", { limit: 60 });
    const items = t.tasks || [];
    tasksEl.innerHTML = '<div class="card"><strong>Synced Kanban &amp; Tracker Tasks (' + items.length + ')</strong>' + (items.length ? items.map((it) => '<div class="row" style="margin-top:5px;"><span><strong>' + esc(it.key || it.id) + '</strong> ' + esc(it.title) + '</span><span class="badge">' + esc(it.status) + '</span></div>').join("") : '<div class="muted" style="margin-top:4px;">No tracker tasks loaded yet.</div>') + '</div>';
  } catch (err) { tasksEl.innerHTML = '<div class="card muted">' + esc(err.message) + '</div>'; }
}
document.getElementById("btnReload").onclick = refresh;
bridge.call("plugin:ready", {}).then(() => { bridge.call("theme:subscribe", {}).catch(() => {}); refresh(); });
