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
        err.data = msg.error.data;
        reject(err);
      } else {
        resolve(msg.result);
      }
      return;
    }
    if (msg.method === "theme:variables") {
      const vars = msg.params?.variables || {};
      for (const [k, v] of Object.entries(vars)) {
        document.documentElement.style.setProperty(k, String(v));
      }
      handlers?.onTheme?.(vars);
    } else if (msg.method === "traces:snapshot") {
      handlers?.onTraces?.(msg.params || {});
    } else if (msg.method === "editor:openedFileChanged") {
      handlers?.onOpenedFileChanged?.(msg.params || {});
    }
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

const bridge = createBridge({}); let cards = []; const listEl = document.getElementById("list");
function render() {
  if (!cards.length) { listEl.innerHTML = '<div class="muted">No pinned references yet.</div>'; return; }
  listEl.innerHTML = cards.map((c, idx) => '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;"><strong>' + esc(c.title) + '</strong><button class="btn" data-del="' + idx + '">Remove</button></div><div class="muted" style="margin-top:4px;">' + esc(c.note) + '</div></div>').join("");
  listEl.querySelectorAll("[data-del]").forEach((btn) => { btn.onclick = async () => { cards.splice(Number(btn.dataset.del), 1); await bridge.call("storage:set", { key: "cards", value: cards }); render(); }; });
}
document.getElementById("btnAdd").onclick = async () => {
  const title = document.getElementById("cardTitle").value.trim(); if (!title) return;
  cards.unshift({ title, note: document.getElementById("cardColor").value.trim(), at: Date.now() });
  document.getElementById("cardTitle").value = ""; document.getElementById("cardColor").value = "";
  await bridge.call("storage:set", { key: "cards", value: cards.slice(0, 40) }); render();
};
bridge.call("plugin:ready", {}).then(async () => {
  bridge.call("theme:subscribe", {}).catch(() => {});
  const st = await bridge.call("storage:get", {}).catch(() => ({ storage: {} }));
  cards = Array.isArray(st?.storage?.cards) ? st.storage.cards : []; render();
});
