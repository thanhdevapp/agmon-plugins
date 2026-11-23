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

let agentWaiting = false;
const bridge = createBridge({
  onTraces: (p) => {
    const needsYou = (p.traces || []).some((t) => ["waiting", "blocked", "needs_input"].includes(String(t.state || "").toLowerCase()));
    agentWaiting = needsYou;
    if (needsYou && gameRunning) {
      gameRunning = false;
      document.getElementById("pauseNote").textContent = "Paused: an agent is waiting for your input!";
    } else if (!needsYou && document.getElementById("pauseNote").textContent) {
      document.getElementById("pauseNote").textContent = "All agents clear. Press an arrow key to resume.";
    }
  },
});
let pomoSec = 1500; let pomoTimer = null;
const clockEl = document.getElementById("pomoClock"); const btnPomo = document.getElementById("btnPomo");
function fmt(s) { return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }
function syncPomo() { clockEl.textContent = fmt(pomoSec); bridge.call("statusBar:update", { itemId: "pomodoro", text: "Focus " + fmt(pomoSec) }).catch(() => {}); }
btnPomo.onclick = () => {
  if (pomoTimer) { clearInterval(pomoTimer); pomoTimer = null; btnPomo.textContent = "Start"; return; }
  btnPomo.textContent = "Pause";
  pomoTimer = setInterval(() => {
    pomoSec = Math.max(0, pomoSec - 1); syncPomo();
    if (pomoSec === 0) { clearInterval(pomoTimer); pomoTimer = null; btnPomo.textContent = "Start"; bridge.call("notifications:toast", { message: "Pomodoro session complete!", level: "success" }).catch(() => {}); }
  }, 1000);
};
document.getElementById("btnReset").onclick = () => { if (pomoTimer) clearInterval(pomoTimer); pomoTimer = null; pomoSec = 1500; btnPomo.textContent = "Start"; syncPomo(); };

const canvas = document.getElementById("game"); const ctx = canvas.getContext("2d");
let snake = [{ x: 6, y: 6 }]; let dir = { x: 1, y: 0 }; let food = { x: 10, y: 8 }; let score = 0; let best = 0; let gameRunning = true;
window.addEventListener("keydown", (e) => {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
  if (agentWaiting) return;
  if (e.key === "ArrowUp" && dir.y === 0) dir = { x: 0, y: -1 };
  else if (e.key === "ArrowDown" && dir.y === 0) dir = { x: 0, y: 1 };
  else if (e.key === "ArrowLeft" && dir.x === 0) dir = { x: -1, y: 0 };
  else if (e.key === "ArrowRight" && dir.x === 0) dir = { x: 1, y: 0 };
  gameRunning = true;
});
setInterval(() => {
  if (!gameRunning) return;
  const head = { x: (snake[0].x + dir.x + 15) % 15, y: (snake[0].y + dir.y + 15) % 15 };
  if (snake.some((s) => s.x === head.x && s.y === head.y)) { snake = [{ x: 6, y: 6 }]; score = 0; }
  else {
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 1; if (score > best) { best = score; bridge.call("storage:set", { key: "bestScore", value: best }).catch(() => {}); }
      food = { x: Math.floor(Math.random() * 15), y: Math.floor(Math.random() * 15) };
    } else snake.pop();
  }
  document.getElementById("score").textContent = String(score);
  document.getElementById("best").textContent = String(best);
  ctx.fillStyle = "#0b0e14"; ctx.fillRect(0, 0, 240, 240);
  ctx.fillStyle = "#f43f5e"; ctx.fillRect(food.x * 16 + 2, food.y * 16 + 2, 12, 12);
  ctx.fillStyle = "#38bdf8"; snake.forEach((s) => ctx.fillRect(s.x * 16 + 1, s.y * 16 + 1, 14, 14));
}, 180);
bridge.call("plugin:ready", {}).then(async () => {
  bridge.call("theme:subscribe", {}).catch(() => {});
  bridge.call("traces:subscribe", {}).catch(() => {});
  const st = await bridge.call("storage:get", {}).catch(() => ({ storage: {} }));
  best = Number(st?.storage?.bestScore || 0); document.getElementById("best").textContent = String(best);
});
