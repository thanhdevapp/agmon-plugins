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

const RECIPES = {
  docker: { file: "docker-compose.sandbox.yml", body: "services:\n  agent-sandbox:\n    image: node:24-bookworm\n    working_dir: /workspace\n    volumes:\n      - .:/workspace\n    security_opt:\n      - no-new-privileges:true\n    command: sleep infinity\n" },
  multipass: { file: "multipass-cloud-init.yaml", body: "#cloud-config\npackage_update: true\npackages:\n  - git\n  - curl\n  - build-essential\nruncmd:\n  - echo 'AGMon disposable Multipass VM ready'\n" },
  lima: { file: "agmon-lima.yaml", body: "images:\n  - location: https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-arm64.img\n    arch: aarch64\ncpus: 4\nmemory: 8GiB\nmounts:\n  - location: '~'\n    writable: false\n" },
  k8s: { file: "agmon-dev-pod.yaml", body: "apiVersion: v1\nkind: Pod\nmetadata:\n  name: agmon-agent-sandbox\nspec:\n  containers:\n    - name: dev\n      image: node:24-slim\n      command: ['sleep', 'infinity']\n" },
};
const kindEl = document.getElementById("kind"); const outEl = document.getElementById("recipe");
function render() { outEl.textContent = RECIPES[kindEl.value].body; }
kindEl.onchange = render;
const bridge = createBridge({});
document.getElementById("btnExport").onclick = async () => { const r = RECIPES[kindEl.value]; await bridge.call("files:exportCopy", { fileName: r.file, content: r.body }); };
render();
bridge.call("plugin:ready", {}).then(() => bridge.call("theme:subscribe", {}).catch(() => {}));
