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

const bridge = createBridge({});
const hygEl = document.getElementById("hygiene"); const qEl = document.getElementById("queue");
let myLeaseId = null;

async function refresh() {
  try {
    const hRes = await bridge.call("workspace:scanHygiene", {});
    const h = hRes.hygiene || {};
    hygEl.innerHTML = '<div class="card"><strong>Worktree: ' + esc(h.workspaceName) + ' (' + esc(h.branch) + ')</strong>' +
      '<div class="muted" style="margin-top:4px;">Modified: ' + (h.git?.modifiedCount || 0) + ' · Staged: ' + (h.git?.stagedCount || 0) + ' · Untracked: ' + (h.git?.untrackedCount || 0) + ' · Stashes: ' + (h.git?.stashCount || 0) + '</div></div>' +
      '<div class="card"><strong>Context Ballast: ~' + Number(h.contextBallast?.estTokens || 0).toLocaleString() + ' tokens</strong>' +
      (h.contextBallast?.items || []).map((i) => '<div class="row muted" style="margin-top:3px;"><span class="mono">' + esc(i.name) + '</span><span>~' + i.estTokens + ' tok</span></div>').join("") + '</div>' +
      '<div class="card"><strong>Stale Doc Path References (' + (h.staleReferences?.length || 0) + ')</strong>' +
      ((h.staleReferences || []).length ? h.staleReferences.slice(0, 10).map((s) => '<div class="mono muted" style="margin-top:2px;">[' + esc(s.source) + '] ' + esc(s.missingPath) + '</div>').join("") : '<div class="muted" style="margin-top:4px;">No broken paths found.</div>') + '</div>';
  } catch (err) { hygEl.innerHTML = '<div class="card muted">' + esc(err.message) + '</div>'; }

  try {
    const qRes = await bridge.call("execution:testQueueStatus", {});
    const st = qRes.status || {};
    qEl.innerHTML = '<div class="card"><div class="row"><strong>Machine-Wide Test Queue</strong><div><button class="btn" id="btnAcq">Acquire Slot</button> ' + (myLeaseId ? '<button class="btn primary" id="btnRel">Release</button>' : '') + '</div></div>' +
      '<div class="muted" style="margin-top:6px;">Active: ' + (st.active ? esc(st.active.label) + ' (' + esc(st.active.workspaceLabel) + ')' : 'Idle') + ' · Waiting: ' + (st.waiting?.length || 0) + '</div></div>';
    document.getElementById("btnAcq").onclick = async () => { const r = await bridge.call("execution:testQueueAcquire", { label: "Suite Run" }); myLeaseId = r.lease?.leaseId || null; refresh(); };
    const relBtn = document.getElementById("btnRel");
    if (relBtn) relBtn.onclick = async () => { await bridge.call("execution:testQueueRelease", { leaseId: myLeaseId }); myLeaseId = null; refresh(); };
  } catch (err) { qEl.innerHTML = '<div class="card muted">' + esc(err.message) + '</div>'; }
}
document.getElementById("btnScan").onclick = refresh;
bridge.call("plugin:ready", {}).then(() => { bridge.call("theme:subscribe", {}).catch(() => {}); refresh(); });
