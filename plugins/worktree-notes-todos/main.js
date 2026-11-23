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

const bridge = createBridge({}); let scope = "global"; let todos = [];
const noteEl = document.getElementById("note"); const todosEl = document.getElementById("todos"); const todoIn = document.getElementById("todoIn");
function renderTodos() {
  todosEl.innerHTML = todos.length ? todos.map((t, i) => '<div class="card row"><label style="display:flex;gap:6px;align-items:center;"><input type="checkbox" data-chk="' + i + '" ' + (t.done ? "checked" : "") + ' /><span style="' + (t.done ? "text-decoration:line-through;opacity:0.6;" : "") + '">' + esc(t.text) + '</span></label><button class="btn" data-rm="' + i + '">Del</button></div>').join("") : '<div class="muted">No TODO items for ' + esc(scope) + '.</div>';
  todosEl.querySelectorAll("[data-chk]").forEach((cb) => { cb.onchange = async () => { todos[Number(cb.dataset.chk)].done = cb.checked; await persist(); renderTodos(); }; });
  todosEl.querySelectorAll("[data-rm]").forEach((b) => { b.onclick = async () => { todos.splice(Number(b.dataset.rm), 1); await persist(); renderTodos(); }; });
}
async function persist() {
  await bridge.call("storage:set", { key: "note:" + scope, value: noteEl.value });
  await bridge.call("storage:set", { key: "todos:" + scope, value: todos.slice(0, 80) });
}
document.getElementById("btnSaveNote").onclick = async () => { await persist(); bridge.call("notifications:toast", { message: "Saved notes for " + scope, level: "success" }).catch(() => {}); };
document.getElementById("btnAddTodo").onclick = async () => { const text = todoIn.value.trim(); if (!text) return; todos.unshift({ text, done: false }); todoIn.value = ""; await persist(); renderTodos(); };
document.getElementById("btnExport").onclick = async () => {
  const md = "# Notes (" + scope + ")\n\n" + noteEl.value + "\n\n## TODOs\n" + todos.map((t) => "- [" + (t.done ? "x" : " ") + "] " + t.text).join("\n") + "\n";
  await bridge.call("files:exportCopy", { fileName: scope + "-notes.md", mimeType: "text/markdown", content: md });
};
bridge.call("plugin:ready", {}).then(async () => {
  bridge.call("theme:subscribe", {}).catch(() => {});
  const ws = await bridge.call("workspace:getSummary", {}).catch(() => ({}));
  scope = ws?.activeProjectName || "global";
  document.getElementById("hdr").textContent = "Notes - " + scope;
  const st = await bridge.call("storage:get", {}).catch(() => ({ storage: {} }));
  noteEl.value = String(st?.storage?.["note:" + scope] || "");
  todos = Array.isArray(st?.storage?.["todos:" + scope]) ? st.storage["todos:" + scope] : []; renderTodos();
});
