// ============================================================
// سرور چندنفره LAN — اجرا: node server/server.js [پورت]
// به‌روزرسانی: npm install (در پوشه server)
// کلاینت‌ها: ws://IPمیزبان:9090
// ============================================================
const { WebSocketServer } = require('ws');

const PORT = Number(process.argv[2]) || 9090;
const wss = new WebSocketServer({ port: PORT });
let nextId = 1;
let hostId = null;
const clients = new Map(); // ws -> {id, name}

function broadcast(obj, exceptWs = null) {
  const data = JSON.stringify(obj);
  for (const ws of wss.clients) {
    if (ws !== exceptWs && ws.readyState === 1) {
      try { ws.send(data); } catch { /* ignore */ }
    }
  }
}

function electHost() {
  const first = [...clients.entries()].find(([, info]) => info.id === hostId);
  if (first) return;
  const any = clients.entries().next();
  if (any.done) { hostId = null; return; }
  hostId = any.value[1].id;
  broadcast({ t: 'host', id: hostId });
  console.log('HOST →', hostId);
}

wss.on('connection', (ws) => {
  const info = { id: nextId++, name: 'خلبان' };
  clients.set(ws, info);
  console.log(`+ client #${info.id}`);
  ws.send(JSON.stringify({ t: 'welcome', id: info.id, host: hostId }));
  if (hostId === null) electHost();

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.t === 'join') {
      info.name = msg.name || info.name;
      broadcast({ t: 'ev', ev: { k: 'join', name: info.name } }, ws);
    } else if (msg.t === 'p') {
      // وضعیت بازیکنان را به بقیه می‌فرستد (تجمیع هر فریم دریافت)
      // برای سادگی: فوراً relay
      const list = [{ id: info.id, name: info.name, ...msg }];
      broadcast({ t: 's', pl: list }, ws);
    } else if (msg.t === 'w') {
      if (info.id === hostId) broadcast(msg, ws);
    } else if (msg.t === 'ev') {
      broadcast({ t: 'ev', ev: msg.ev }, ws);
    }
  });

  ws.on('close', () => {
    console.log(`- client #${info.id}`);
    clients.delete(ws);
    if (hostId === info.id) electHost();
  });
});

console.log(`AIRDOM LAN server → port ${PORT}`);
console.log('بازیکنان: http://<IP این سیستم>:8123 را باز کنند و IP را وارد کنند');
