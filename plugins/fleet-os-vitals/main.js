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

const bridge = createBridge({}); const rootEl = document.getElementById("root");
async function poll() {
  try {
    const res = await bridge.call("system:getVitals", {});
    const v = res.vitals || {};
    const usedGb = ((v.usedMemBytes || 0) / (1024 ** 3)).toFixed(1);
    const totalGb = ((v.totalMemBytes || 0) / (1024 ** 3)).toFixed(1);
    bridge.call("statusBar:update", { itemId: "ram-load", text: "RAM " + Math.round(v.memUsedPercent || 0) + "% · L" + (v.loadAvg1m ?? 0) }).catch(() => {});
    rootEl.innerHTML = '<div class="card"><strong>' + esc(v.hostname) + ' (' + esc(v.platform) + '/' + esc(v.arch) + ')</strong><div class="muted">' + esc(v.cpuModel) + ' · ' + v.cpuCount + ' cores</div></div>' +
      '<div class="card"><div class="row"><strong>Memory</strong><span>' + usedGb + ' / ' + totalGb + ' GB (' + v.memUsedPercent + '%)</span></div><div class="meter"><div style="width:' + Math.min(100, v.memUsedPercent || 0) + '%"></div></div></div>' +
      '<div class="card"><div class="row"><strong>Load Average</strong><span class="mono">' + v.loadAvg1m + ' · ' + v.loadAvg5m + ' · ' + v.loadAvg15m + '</span></div><div class="muted" style="margin-top:4px;">Uptime: ' + Math.round((v.uptimeSec || 0) / 3600) + ' hours</div></div>';
  } catch (err) { rootEl.innerHTML = '<div class="card muted">' + esc(err.message) + '</div>'; }
}
document.getElementById("btnNow").onclick = poll;
bridge.call("plugin:ready", {}).then(() => { bridge.call("theme:subscribe", {}).catch(() => {}); poll(); setInterval(poll, 5000); });
