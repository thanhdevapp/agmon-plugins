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

let pack = "chime";
let sharedAudioCtx = null;
function playTone(mode) {
  if (mode === "muted") return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
    if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume().catch(() => {});
    const ac = sharedAudioCtx;
    const osc = ac.createOscillator(); const g = ac.createGain();
    osc.type = mode === "arcade" ? "square" : "sine";
    osc.frequency.value = mode === "sonar" ? 320 : mode === "arcade" ? 660 : 523.25;
    g.gain.setValueAtTime(0.08, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
    osc.connect(g); g.connect(ac.destination); osc.start(); osc.stop(ac.currentTime + 0.26);
  } catch {}
}
const bridge = createBridge({
  onTraces: (p) => {
    const traces = p.traces || [];
    const payload = { activeAgents: traces.length, waiting: traces.filter((t) => String(t.state).includes("wait")).length, updatedAt: new Date().toISOString() };
    document.getElementById("payload").textContent = JSON.stringify(payload, null, 2);
  },
});
document.getElementById("btnTest").onclick = () => { playTone(pack); bridge.call("notifications:toast", { message: "Played " + pack + " alert", level: "info" }).catch(() => {}); };
document.getElementById("pack").onchange = async (e) => { pack = e.target.value; await bridge.call("settings:set", { key: "soundPack", value: pack }).catch(() => {}); };
bridge.call("plugin:ready", {}).then(async () => {
  bridge.call("theme:subscribe", {}).catch(() => {});
  const s = await bridge.call("settings:get", {}).catch(() => ({ settings: {} }));
  if (s?.settings?.soundPack) { pack = s.settings.soundPack; document.getElementById("pack").value = pack; }
  bridge.call("traces:subscribe", {}).catch(() => {});
});
