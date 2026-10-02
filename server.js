// Karaoke Night — server della serata
// Avvio: npm install, poi npm start (vedi README.md)

require("dotenv").config();
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
// Funziona sia con le cartelle lib/ e public/ sia con tutti i file nella cartella principale
const yt = fs.existsSync(path.join(__dirname, "lib", "youtube.js")) ? require("./lib/youtube") : require("./youtube");
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public") : __dirname;
const PAGES = new Set(["index.html", "regia.html", "schermo.html", "style.css", "common.js"]);

const PORT = process.env.PORT || 3000;
const DJ_PIN = String(process.env.DJ_PIN || "karaoke");
const YT_KEY = process.env.YOUTUBE_API_KEY || "";
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const STATE_FILE = path.join(__dirname, "data", "state.json");

// ---------- stato della serata ----------
const DEFAULT_SETTINGS = { name: "Karaoke Night", open: true, maxPerSinger: 2, minutesPerSong: 4 };
let state = { settings: { ...DEFAULT_SETTINGS }, queue: [] };
try {
  const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  state = { settings: { ...DEFAULT_SETTINGS, ...saved.settings }, queue: saved.queue || [] };
  // una ricerca interrotta da un riavvio va rifatta
  state.queue.forEach((q) => { if (q.search?.state === "searching") q.search = { state: "idle" }; });
} catch {}

let player = { videoId: null, state: "idle", time: 0, duration: 0 };
let quota = { day: today(), searches: 0 };
function today() { return new Date().toISOString().slice(0, 10); }

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(state)); }
    catch (e) { console.error("Salvataggio non riuscito:", e.message); }
  }, 300);
}

const uid = () => crypto.randomBytes(6).toString("hex");
const clean = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
const byPos = (a, b) => (a.pos - b.pos) || (a.createdAt - b.createdAt);
const waiting = () => state.queue.filter((q) => q.status === "waiting").sort(byPos);
const current = () => state.queue.find((q) => q.status === "singing") || null;
const find = (id) => state.queue.find((q) => q.id === id);
const maxPos = () => state.queue.reduce((m, q) => Math.max(m, q.pos || 0), 0);
const minPos = () => Math.min(0, ...waiting().map((q) => q.pos));
const sameSinger = (a, b) => yt.norm(a) === yt.norm(b);

// ---------- server web ----------
const app = express();
app.set("trust proxy", true);
// Pubblica solo le pagine dell'app (mai server.js, package.json o altri file)
const sendPage = (name) => (req, res) => res.sendFile(path.join(PUBLIC_DIR, name));
app.get("/", sendPage("index.html"));
app.get(["/regia", "/regia.html"], sendPage("regia.html"));
app.get(["/schermo", "/schermo.html"], sendPage("schermo.html"));
app.get("/:file", (req, res, next) => PAGES.has(req.params.file) ? sendPage(req.params.file)(req, res) : next());

function guestUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL + "/";
  return `${req.protocol}://${req.get("host")}/`;
}
app.get("/qr.svg", async (req, res) => {
  const svg = await QRCode.toString(guestUrl(req), { type: "svg", margin: 1, color: { dark: "#150f1c", light: "#ffffff" } });
  res.type("image/svg+xml").send(svg);
});
app.get("/api/info", (req, res) => res.json({ guestUrl: guestUrl(req) }));

const server = http.createServer(app);
const io = new Server(server);

// ---------- viste inviate ai client ----------
function publicItem(q) { return { id: q.id, singer: q.singer, title: q.title, artist: q.artist }; }
function guestView(clientId) {
  const cur = current();
  return {
    settings: state.settings,
    current: cur ? publicItem(cur) : null,
    queue: waiting().map((q) => ({ ...publicItem(q), mine: !!clientId && q.clientId === clientId })),
    done: state.queue.filter((q) => q.status === "done").length
  };
}
function djView() {
  return {
    settings: state.settings,
    queue: state.queue.map(({ clientId, ...q }) => q),
    player,
    screens: io.sockets.adapter.rooms.get("screen")?.size || 0,
    youtube: { enabled: !!YT_KEY, searchesToday: quota.day === today() ? quota.searches : 0 }
  };
}
function screenView() {
  const cur = current();
  return {
    settings: state.settings,
    current: cur ? { ...publicItem(cur), videoId: cur.videoId || null } : null,
    next: waiting().slice(0, 5).map(publicItem)
  };
}

let broadcastTimer = null;
function broadcast() {
  save();
  clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    io.to("dj").emit("state", djView());
    io.to("screen").emit("state", screenView());
    for (const [, s] of io.of("/").sockets) if (s.data.role === "guest") s.emit("state", guestView(s.data.clientId));
  }, 30);
}

// Il proiettore carica la base della canzone in corso (in pausa: parte quando il DJ preme Play)
function cueCurrent() {
  const cur = current();
  io.to("screen").emit("player:load", { videoId: cur?.videoId || null, autoplay: false });
}

// ---------- ricerca basi ----------
async function searchFor(item, customQuery) {
  if (!item) return;
  item.search = { state: "searching", query: customQuery || "" };
  broadcast();
  try {
    if (quota.day !== today()) quota = { day: today(), searches: 0 };
    const r = await yt.searchKaraoke(item, YT_KEY, customQuery);
    if (!r.cached) quota.searches++;
    const manual = (item.candidates || []).filter((c) => c.manual);
    const seen = new Set(manual.map((c) => c.id));
    item.candidates = [...manual, ...r.candidates.filter((c) => !seen.has(c.id))];
    item.search = { state: "done", query: r.query };
    if (!item.videoId && item.candidates[0]) {
      item.videoId = item.candidates[0].id;
      if (item.status === "singing") cueCurrent();
    }
  } catch (e) {
    const msg = e.code === "quota" ? "Quota giornaliera di YouTube esaurita: incolla il link a mano."
      : e.code === "nokey" ? "Ricerca automatica spenta: manca la chiave YouTube. Incolla il link a mano."
      : e.code === "key" ? "La chiave YouTube non è valida o non è abilitata."
      : "Ricerca non riuscita: riprova o incolla il link a mano.";
    item.search = { state: "error", error: msg, query: customQuery || "" };
    console.error("Ricerca YouTube:", e.message);
  }
  broadcast();
}

function addSong({ singer, title, artist, source, clientId }) {
  const item = {
    id: uid(), singer, title, artist, source, clientId: clientId || null,
    status: "waiting", pos: maxPos() + 1, createdAt: Date.now(),
    candidates: [], videoId: null, search: { state: "idle" }
  };
  state.queue.push(item);
  broadcast();
  if (YT_KEY) searchFor(item);
  return item;
}

// ---------- connessioni ----------
io.use((socket, next) => {
  const { role, pin, clientId } = socket.handshake.auth || {};
  if (role === "dj" || role === "screen") {
    if (String(pin || "") !== DJ_PIN) return next(new Error("pin"));
    socket.data.role = role;
  } else {
    socket.data.role = "guest";
    socket.data.clientId = clean(clientId, 40) || null;
  }
  next();
});

const lastRequest = new Map();

io.on("connection", (socket) => {
  const role = socket.data.role;
  socket.join(role);
  if (role === "dj") socket.emit("state", djView());
  if (role === "screen") { socket.emit("state", screenView()); cueCurrent(); broadcast(); socket.on("disconnect", () => setTimeout(broadcast, 50)); }
  if (role === "guest") socket.emit("state", guestView(socket.data.clientId));

  // ----- ospiti -----
  socket.on("guest:request", (data, ack = () => {}) => {
    const singer = clean(data?.singer, 30), title = clean(data?.title, 80), artist = clean(data?.artist, 60);
    if (!state.settings.open) return ack({ error: "Le prenotazioni sono chiuse in questo momento." });
    if (!singer) return ack({ error: "Scrivi il tuo nome." });
    if (!title) return ack({ error: "Scrivi il titolo della canzone." });
    const cid = socket.data.clientId || socket.id;
    const last = lastRequest.get(cid) || 0;
    if (Date.now() - last < 8000) return ack({ error: "Aspetta qualche secondo prima di un'altra prenotazione." });
    const mine = waiting().filter((q) => sameSinger(q.singer, singer) || (socket.data.clientId && q.clientId === socket.data.clientId)).length;
    if (mine >= state.settings.maxPerSinger) return ack({ error: `Hai già ${mine} canzoni in coda: aspetta di cantarne una.` });
    if (waiting().some((q) => yt.norm(q.title) === yt.norm(title) && yt.norm(q.artist) === yt.norm(artist))) return ack({ error: "Questa canzone è già in coda: scegline un'altra." });
    lastRequest.set(cid, Date.now());
    const item = addSong({ singer, title, artist, source: "guest", clientId: socket.data.clientId });
    ack({ ok: true, id: item.id, position: waiting().findIndex((q) => q.id === item.id) + 1 });
  });

  socket.on("guest:cancel", (id, ack = () => {}) => {
    const q = find(id);
    if (!q || q.status !== "waiting" || !socket.data.clientId || q.clientId !== socket.data.clientId) return ack({ error: "Prenotazione non trovata." });
    state.queue = state.queue.filter((x) => x.id !== id);
    broadcast(); ack({ ok: true });
  });

  if (role === "screen") {
    socket.on("screen:status", (s) => {
      player = { videoId: s?.videoId || null, state: String(s?.state || "idle"), time: +s?.time || 0, duration: +s?.duration || 0 };
      io.to("dj").volatile.emit("player", player);
    });
    // Video non riproducibile (embed bloccato, rimosso…): passa alla base successiva
    socket.on("screen:error", ({ videoId, code }) => {
      const cur = current();
      if (!cur || cur.videoId !== videoId) return;
      const list = cur.candidates || [];
      cur.failed = [...new Set([...(cur.failed || []), videoId])];
      const nextOk = list.find((c) => !cur.failed.includes(c.id));
      cur.videoId = nextOk ? nextOk.id : null;
      io.to("dj").emit("notice", nextOk ? `Base non riproducibile (errore ${code}): passo alla successiva.` : "Nessuna base riproducibile: cercane un'altra.");
      broadcast(); cueCurrent();
    });
  }

  if (role !== "dj") return;

  // ----- regia -----
  socket.on("dj:add", (d) => {
    const singer = clean(d?.singer, 30), title = clean(d?.title, 80);
    if (singer && title) addSong({ singer, title, artist: clean(d?.artist, 60), source: "dj" });
  });
  socket.on("dj:remove", (id) => { const wasCurrent = current()?.id === id; state.queue = state.queue.filter((q) => q.id !== id); broadcast(); if (wasCurrent) cueCurrent(); });
  socket.on("dj:move", ({ id, dir }) => {
    const w = waiting(); const i = w.findIndex((q) => q.id === id); const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= w.length) return;
    [w[i].pos, w[j].pos] = [w[j].pos, w[i].pos];
    if (w[i].pos === w[j].pos) w[i].pos += dir;
    broadcast();
  });
  socket.on("dj:top", (id) => { const q = find(id); if (q) { q.pos = minPos() - 1; broadcast(); } });
  socket.on("dj:next", () => {
    const cur = current(); if (cur) { cur.status = "done"; cur.endedAt = Date.now(); }
    const n = waiting()[0]; if (n) { n.status = "singing"; n.startedAt = Date.now(); }
    broadcast(); cueCurrent();
  });
  socket.on("dj:skip", () => { const cur = current(); if (cur) { cur.status = "skipped"; cur.endedAt = Date.now(); broadcast(); cueCurrent(); } });
  socket.on("dj:singNow", (id) => {
    const cur = current(); if (cur) { cur.status = "waiting"; cur.pos = minPos() - 1; cur.startedAt = null; }
    const q = find(id); if (q) { q.status = "singing"; q.startedAt = Date.now(); }
    broadcast(); cueCurrent();
  });
  socket.on("dj:requeue", (id) => { const q = find(id); if (q) { q.status = "waiting"; q.pos = maxPos() + 1; q.endedAt = null; broadcast(); } });
  socket.on("dj:setVideo", ({ id, videoId }) => {
    const q = find(id); if (!q || !(q.candidates || []).some((c) => c.id === videoId)) return;
    q.videoId = videoId; broadcast(); if (q.status === "singing") cueCurrent();
  });
  socket.on("dj:search", ({ id, query }) => searchFor(find(id), clean(query, 120)));
  socket.on("dj:addUrl", async ({ id, url }, ack = () => {}) => {
    const q = find(id); if (!q) return ack({ error: "Canzone non trovata." });
    const c = await yt.candidateFromUrl(url, YT_KEY, q);
    if (!c) return ack({ error: "Questo non sembra un link di YouTube." });
    q.candidates = [c, ...(q.candidates || []).filter((x) => x.id !== c.id)];
    q.videoId = c.id;
    broadcast(); if (q.status === "singing") cueCurrent();
    ack({ ok: true });
  });
  socket.on("dj:settings", (s) => {
    const st = state.settings;
    if (typeof s?.name === "string") st.name = clean(s.name, 40) || DEFAULT_SETTINGS.name;
    if (typeof s?.open === "boolean") st.open = s.open;
    if (s?.maxPerSinger) st.maxPerSinger = Math.min(10, Math.max(1, parseInt(s.maxPerSinger) || 2));
    if (s?.minutesPerSong) st.minutesPerSong = Math.min(10, Math.max(2, parseInt(s.minutesPerSong) || 4));
    broadcast();
  });
  socket.on("dj:reset", () => { state.queue = []; broadcast(); cueCurrent(); });
  socket.on("dj:player", (cmd) => io.to("screen").emit("player:cmd", cmd));
});

server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  console.log("\n🎤  Karaoke Night è partito!\n");
  console.log(`   Regia (tu):        http://localhost:${PORT}/regia`);
  console.log(`   Schermo/proiettore: http://localhost:${PORT}/schermo`);
  ips.forEach((ip) => console.log(`   Ospiti (stessa Wi-Fi): http://${ip}:${PORT}/`));
  if (!process.env.DJ_PIN) console.log("\n⚠️  PIN regia predefinito: \"karaoke\". Impostane uno tuo in .env (DJ_PIN).");
  if (!YT_KEY) console.log("⚠️  Nessuna chiave YouTube: la ricerca automatica è spenta, puoi incollare i link a mano.");
  console.log("");
});
