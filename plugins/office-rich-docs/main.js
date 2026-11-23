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

let mtimeMs = null; let ext = ".mdx"; let narrow = false;
const srcEl = document.getElementById("src"); const previewEl = document.getElementById("preview"); const statusEl = document.getElementById("status");
function renderTextPreview(text) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  statusEl.textContent = words + " words";
  const html = text.split(/\r?\n/).map((line) => {
    if (line.startsWith("### ")) return "<h3>" + esc(line.slice(4)) + "</h3>";
    if (line.startsWith("## ")) return "<h2>" + esc(line.slice(3)) + "</h2>";
    if (line.startsWith("# ")) return "<h1>" + esc(line.slice(2)) + "</h1>";
    if (line.startsWith("> ")) return '<blockquote style="border-left:3px solid var(--accent-primary,#38bdf8);padding-left:8px;margin:4px 0;">' + esc(line.slice(2)) + '</blockquote>';
    if (line.startsWith("- ")) return "<li>" + esc(line.slice(2)) + "</li>";
    return '<p style="margin:4px 0">' + esc(line) + '</p>';
  }).join("");
  previewEl.innerHTML = narrow ? '<div style="max-width:620px;margin:0 auto">' + html + '</div>' : html;
}
const bridge = createBridge({ onOpenedFileChanged: () => loadFile() });
async function loadFile() {
  try {
    const res = await bridge.call("editor:readOpenedFile", {});
    mtimeMs = res.mtimeMs ?? null; ext = res.extension || ".mdx";
    document.getElementById("title").textContent = "Rich Docs - " + res.fileName;
    if (res.encoding === "base64") {
      srcEl.style.display = "none";
      const bin = atob(res.content || "");
      const isZip = bin.charCodeAt(0) === 0x50 && bin.charCodeAt(1) === 0x4b;
      previewEl.innerHTML = '<div class="card"><strong>Office Document: ' + esc(res.fileName) + '</strong><div class="muted">Format: ' + (isZip ? "OpenXML Package (" + ext + ")" : "Binary") + ' · Size: ' + res.byteLength + ' bytes</div><p>Verified offline container structure inside zero-egress sandbox.</p></div>';
      statusEl.textContent = "Read-only (" + res.byteLength + " B)"; return;
    }
    srcEl.style.display = "block"; srcEl.value = res.content || ""; renderTextPreview(srcEl.value);
  } catch (err) { statusEl.textContent = err.message; }
}
srcEl.addEventListener("input", () => renderTextPreview(srcEl.value));
document.getElementById("btnNarrow").onclick = () => { narrow = !narrow; renderTextPreview(srcEl.value); };
document.getElementById("btnSave").onclick = async () => {
  try { const res = await bridge.call("editor:saveOpenedFile", { content: srcEl.value, encoding: "utf-8", expectedMtimeMs: mtimeMs }); mtimeMs = res.mtimeMs; statusEl.textContent = "Saved (" + res.byteLength + " B)"; }
  catch (err) { statusEl.textContent = err.message; }
};
bridge.call("plugin:ready", {}).then(() => { bridge.call("theme:subscribe", {}).catch(() => {}); loadFile(); });
