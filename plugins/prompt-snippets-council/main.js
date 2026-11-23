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

const bridge = createBridge({}); let snippets = []; let activeProject = "workspace";
const rawEl = document.getElementById("raw"); const outEl = document.getElementById("out"); const snipsEl = document.getElementById("snips");
function renderSnips() {
  snipsEl.innerHTML = snippets.length ? snippets.map((s, i) => '<div class="row" style="margin-bottom:4px;"><span class="mono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(s.slice(0, 48)) + '</span><button class="btn" data-use="' + i + '">Use</button></div>').join("") : '<div class="muted">No snippets yet.</div>';
  snipsEl.querySelectorAll("[data-use]").forEach((b) => { b.onclick = () => { rawEl.value = snippets[Number(b.dataset.use)]; }; });
}
document.getElementById("btnBuild").onclick = () => {
  const idea = rawEl.value.trim(); if (!idea) return;
  const lvl = Number(document.getElementById("level").value);
  if (lvl === 5) {
    outEl.value = "[BLIND MULTI-MODEL COUNCIL - " + activeProject + "]\nQuestion: " + idea + "\n1. Independent answers from Claude, Codex, and Gemini.\n2. Anonymize as Proposal A/B/C.\n3. Blind judge scores correctness, security boundaries, and rollback risk.";
  } else if (lvl === 4) {
    outEl.value = "[Project: " + activeProject + " | Architecture & Security Review]\nGoal: " + idea + "\nDeliverables: Threat model (trust boundaries, auth, path containment), interface contracts, migration/rollback plan, and verification matrix.";
  } else if (lvl === 3) {
    outEl.value = "[Project: " + activeProject + "]\nGoal: " + idea + "\nConstraints: Follow AGENTS.md rules, zero raw emoji, preserve backward compatibility, add failing reproduction test before fix, verify build + tests.";
  } else if (lvl === 2) {
    outEl.value = "[Project: " + activeProject + "]\nTask: " + idea + "\nInclude explicit acceptance criteria, error handling, and edge-case tests.";
  } else {
    outEl.value = idea;
  }
};
document.getElementById("btnSaveSnip").onclick = async () => {
  const txt = (outEl.value || rawEl.value).trim(); if (!txt) return;
  snippets.unshift(txt); snippets = snippets.slice(0, 30);
  await bridge.call("storage:set", { key: "snippets", value: snippets });
  bridge.call("notifications:toast", { message: "Saved prompt snippet", level: "success" }).catch(() => {});
  renderSnips();
};
bridge.call("plugin:ready", {}).then(async () => {
  bridge.call("theme:subscribe", {}).catch(() => {});
  const ws = await bridge.call("workspace:getSummary", {}).catch(() => ({}));
  activeProject = ws?.activeProjectName || "workspace";
  const st = await bridge.call("storage:get", {}).catch(() => ({ storage: {} }));
  snippets = Array.isArray(st?.storage?.snippets) ? st.storage.snippets : []; renderSnips();
});
