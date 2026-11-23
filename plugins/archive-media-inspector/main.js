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

const rootEl = document.getElementById("root"); const statusEl = document.getElementById("status");
function parseZipEntries(res) {
  if (res.encoding !== "base64") return [];
  let bin = "";
  try { bin = atob(res.content || ""); } catch { return []; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const view = new DataView(bytes.buffer); const names = [];
  for (let i = 0; i < bytes.length - 46; i++) {
    if (view.getUint32(i, true) === 0x02014b50) {
      const compSize = view.getUint32(i + 20, true); const uncompSize = view.getUint32(i + 24, true); const nameLen = view.getUint16(i + 28, true);
      const name = new TextDecoder().decode(bytes.subarray(i + 46, i + 46 + nameLen));
      names.push({ name, compSize, uncompSize }); if (names.length >= 200) break;
    }
  }
  return names;
}
const bridge = createBridge({ onOpenedFileChanged: () => loadFile() });
async function loadFile() {
  try {
    const res = await bridge.call("editor:readOpenedFile", {});
    document.getElementById("title").textContent = "Inspector - " + res.fileName; statusEl.textContent = res.byteLength + " bytes";
    if ([".zip", ".jar", ".apk", ".whl"].includes(res.extension)) {
      const entries = parseZipEntries(res);
      rootEl.innerHTML = "<table><thead><tr><th>Archive Entry</th><th>Compressed</th><th>Uncompressed</th></tr></thead><tbody>" + entries.map((e) => '<tr><td class="mono">' + esc(e.name) + '</td><td>' + e.compSize + '</td><td>' + e.uncompSize + '</td></tr>').join("") + "</tbody></table>";
    } else if ([".wav", ".mp3"].includes(res.extension)) {
      const mime = res.extension === ".wav" ? "audio/wav" : "audio/mpeg";
      rootEl.innerHTML = '<div class="card"><strong>Audio Preview: ' + esc(res.fileName) + '</strong><div style="margin-top:8px"><audio controls src="data:' + mime + ';base64,' + res.content + '"></audio></div></div>';
    } else {
      rootEl.innerHTML = '<div class="card"><strong>File: ' + esc(res.fileName) + '</strong><div class="muted">Extension: ' + esc(res.extension) + ' · Encoding: ' + esc(res.encoding) + ' · Size: ' + res.byteLength + ' bytes</div><pre class="mono" style="margin-top:8px;max-height:320px;overflow:auto;">' + esc(String(res.content || "").slice(0, 4000)) + '</pre></div>';
    }
  } catch (err) { statusEl.textContent = err.message; }
}
bridge.call("plugin:ready", {}).then(() => { bridge.call("theme:subscribe", {}).catch(() => {}); loadFile(); });
