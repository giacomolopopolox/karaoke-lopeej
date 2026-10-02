// Canta con Lopee J! — server della serata karaoke
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

// Funziona sia con i file nella cartella principale sia con le cartelle lib/ e public/
const yt = fs.existsSync(path.join(__dirname, "lib", "youtube.js")) ? require("./lib/youtube") : require("./youtube");
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public") : __dirname;

const PORT = process.env.PORT || 3000;
const DJ_PIN = String(process.env.DJ_PIN || "karaoke");
const YT_KEY = process.env.YOUTUBE_API_KEY || "";
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const PRIVACY_CONTACT = String(process.env.PRIVACY_CONTACT || "").slice(0, 120);
const DATA_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const SELFIE_DIR = path.join(DATA_DIR, "selfies");
// Chiave che apre le foto: la conoscono solo regia e schermo (cambia a ogni avvio)
const SELFIE_TOKEN = crypto.randomBytes(16).toString("hex");

// ---------- stato della serata ----------
const DEFAULT_FILLER = { url: "", videoId: null, listId: null, enabled: true, volume: 60, visibility: 45 };
const DEFAULT_SETTINGS = { name: "Canta con Lopee J!", open: true, maxPerSinger: 2, minutesPerSong: 4, showSelfies: true, liveOverlay: true, filler: { ...DEFAULT_FILLER } };

// Musica d'attesa: accetta il link di un video o di una playlist YouTube
function parseFiller(raw) {
  const url = String(raw || "").trim().slice(0, 300);
  if (!url) return { url: "", videoId: null, listId: null };
  let listId = null;
  try { listId = new URL(url).searchParams.get("list"); } catch {}
  if (listId && !/^[\w-]{10,64}$/.test(listId)) listId = null;
  const videoId = yt.videoIdFromUrl(url);
  if (!videoId && !listId) return null;
  return { url, videoId, listId };
}
let state = { settings: { ...DEFAULT_SETTINGS }, queue: [] };
try {
  const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  state = { settings: { ...DEFAULT_SETTINGS, ...saved.settings, filler: { ...DEFAULT_FILLER, ...(saved.settings?.filler || {}) } }, queue: saved.queue || [] };
  if (state.settings.name === "Karaoke Night") state.settings.name = DEFAULT_SETTINGS.name;
  state.queue.forEach((q) => { if (q.search?.state === "searching") q.search = { state: "idle" }; });
} catch {}

let player = { videoId: null, state: "idle", time: 0, duration: 0, filler: { playing: false, title: "" } };
let quota = { day: today(), searches: 0 };
function today() { return new Date().toISOString().slice(0, 10); }

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(state)); }
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

// ---------- selfie ----------
const selfiePath = (id) => path.join(SELFIE_DIR, id.replace(/[^a-f0-9]/g, "") + ".jpg");
function saveSelfie(id, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) return false;
  const buf = Buffer.from(m[2], "base64");
  if (buf.length < 500 || buf.length > 1.5 * 1024 * 1024) return false;
  try { fs.mkdirSync(SELFIE_DIR, { recursive: true }); fs.writeFileSync(selfiePath(id), buf); return true; } catch { return false; }
}
function deleteSelfie(item) {
  if (!item) return;
  try { fs.unlinkSync(selfiePath(item.id)); } catch {}
  item.hasSelfie = false;
}
// Il selfie viene cancellato appena l'esibizione finisce
function finish(item, status) { item.status = status; item.endedAt = Date.now(); deleteSelfie(item); }
const selfieUrl = (q) => (q.hasSelfie ? `/selfie/${q.id}?t=${SELFIE_TOKEN}` : null);

// ---------- server web ----------
const app = express();
app.set("trust proxy", true);

// Pubblica solo i file dell'app (mai server.js, package.json, .env o i dati)
const PAGES = new Set(["index.html", "regia.html", "schermo.html", "privacy.html", "style.css", "common.js", "logo.png", "dj-capitano.jpg", "dj-paillettes.jpg", "dj-faccia-1.jpg", "dj-faccia-2.jpg"]);
const sendPage = (name) => (req, res) => res.sendFile(path.join(PUBLIC_DIR, name), { maxAge: /\.(png|jpg)$/.test(name) ? "1d" : 0 });
app.get("/", sendPage("index.html"));
app.get(["/regia", "/regia.html"], sendPage("regia.html"));
app.get(["/schermo", "/schermo.html"], sendPage("schermo.html"));
app.get(["/privacy", "/privacy.html"], sendPage("privacy.html"));
app.get("/selfie/:id", (req, res) => {
  if (req.query.t !== SELFIE_TOKEN) return res.sendStatus(404);
  const p = selfiePath(req.params.id);
  if (!fs.existsSync(p)) return res.sendStatus(404);
  res.set("Cache-Control", "private, no-store").type("image/jpeg").sendFile(p);
});
function guestUrl(req) { return PUBLIC_URL ? PUBLIC_URL + "/" : `${req.protocol}://${req.get("host")}/`; }
app.get("/qr.svg", async (req, res) => {
  const svg = await QRCode.toString(guestUrl(req), { type: "svg", margin: 1, color: { dark: "#16190f", light: "#ffffff" } });
  res.type("image/svg+xml").send(svg);
});
app.get("/api/info", (req, res) => res.json({ guestUrl: guestUrl(req), privacyContact: PRIVACY_CONTACT }));

// ---------- suggerimenti mentre l'ospite scrive (Deezer, con iTunes come riserva) ----------
// Gratuiti e senza chiave: non consumano la quota di YouTube.
const suggestCache = new Map();
const suggestHits = new Map();
async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000), headers: { "User-Agent": "CantaConLopeeJ/1.0" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
async function suggestFrom(q) {
  try {
    const d = await fetchJson("https://api.deezer.com/search?limit=12&q=" + encodeURIComponent(q));
    if (d?.error) throw new Error(d.error.message || "deezer");
    return (d.data || []).map((t) => ({ title: t.title_short || t.title, artist: t.artist?.name || "", cover: t.album?.cover_small || "" }));
  } catch (e) {
    const d = await fetchJson("https://itunes.apple.com/search?media=music&entity=song&limit=12&country=IT&term=" + encodeURIComponent(q));
    return (d.results || []).map((t) => ({ title: t.trackName || "", artist: t.artistName || "", cover: t.artworkUrl60 || "" }));
  }
}
app.get("/api/suggest", async (req, res) => {
  const q = clean(req.query.q, 80);
  if (q.length < 2) return res.json([]);
  // limite gentile per telefono: 40 ricerche al minuto
  const ip = req.ip || "x", now = Date.now();
  const h = (suggestHits.get(ip) || []).filter((t) => now - t < 60000);
  if (h.length >= 40) return res.status(429).json([]);
  h.push(now); suggestHits.set(ip, h);
  const key = yt.norm(q);
  const hit = suggestCache.get(key);
  if (hit && now - hit.at < 3600000) return res.json(hit.items);
  try {
    const seen = new Set();
    const items = (await suggestFrom(q))
      .map((t) => ({ ...t, title: String(t.title || "").replace(/\s*[-–]\s*(\d{4}\s*)?(remaster(ed)?|live|radio edit|single version|versione).*$/i, "").replace(/\s*[([](\d{4}\s*)?remaster(ed)?[^)\]]*[)\]]/i, "").trim() }))
      .filter((t) => t.title)
      .filter((t) => { const k = yt.norm(t.title.replace(/\s*[([].*?[)\]]/g, "")) + "|" + yt.norm(t.artist); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((t) => ({ title: t.title.slice(0, 80), artist: t.artist.slice(0, 60), cover: /^https:\/\//.test(t.cover) ? t.cover : "" }))
      .slice(0, 7);
    suggestCache.set(key, { at: now, items });
    if (suggestCache.size > 2000) suggestCache.delete(suggestCache.keys().next().value);
    res.json(items);
  } catch (e) {
    res.json([]);
  }
});
app.get("/:file", (req, res, next) => (PAGES.has(req.params.file) ? sendPage(req.params.file)(req, res) : next()));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 3e6 });

// ---------- viste inviate ai client ----------
const publicItem = (q) => ({ id: q.id, singer: q.singer, title: q.title, artist: q.artist });
function guestView(clientId) {
  const cur = current();
  return {
    settings: { name: state.settings.name, open: state.settings.open, maxPerSinger: state.settings.maxPerSinger, minutesPerSong: state.settings.minutesPerSong },
    current: cur ? publicItem(cur) : null,
    queue: waiting().map((q) => ({ ...publicItem(q), mine: !!clientId && q.clientId === clientId })),
    done: state.queue.filter((q) => q.status === "done").length
  };
}
function djView() {
  return {
    settings: state.settings,
    queue: state.queue.map(({ clientId, ...q }) => ({ ...q, selfie: selfieUrl(q) })),
    player,
    screens: io.sockets.adapter.rooms.get("screen")?.size || 0,
    youtube: { enabled: !!YT_KEY, searchesToday: quota.day === today() ? quota.searches : 0 }
  };
}
function screenView() {
  const cur = current(), show = state.settings.showSelfies;
  const withPic = (q) => ({ ...publicItem(q), selfie: show ? selfieUrl(q) : null });
  return {
    settings: { name: state.settings.name, open: state.settings.open, filler: state.settings.filler, liveOverlay: state.settings.liveOverlay },
    current: cur ? { ...withPic(cur), videoId: cur.videoId || null, startedAt: cur.startedAt || 0 } : null,
    next: waiting().slice(0, 5).map(withPic)
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

function addSong({ singer, title, artist, source, clientId, selfie, consentAt }) {
  const item = {
    id: uid(), singer, title, artist, source, clientId: clientId || null,
    status: "waiting", pos: maxPos() + 1, createdAt: Date.now(),
    candidates: [], videoId: null, search: { state: "idle" },
    hasSelfie: false, consentAt: consentAt || null
  };
  if (selfie) item.hasSelfie = saveSelfie(item.id, selfie);
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
    if (typeof ack !== "function") return;
    const singer = clean(data?.singer, 30), title = clean(data?.title, 80), artist = clean(data?.artist, 60);
    if (!state.settings.open) return ack({ error: "Le prenotazioni sono chiuse in questo momento." });
    if (!singer) return ack({ error: "Scrivi il tuo nome." });
    if (!title) return ack({ error: "Scrivi il titolo della canzone." });
    if (data?.consent !== true) return ack({ error: "Per prenotare devi accettare l'informativa privacy." });
    const cid = socket.data.clientId || socket.id;
    if (Date.now() - (lastRequest.get(cid) || 0) < 8000) return ack({ error: "Aspetta qualche secondo prima di un'altra prenotazione." });
    const mine = waiting().filter((q) => sameSinger(q.singer, singer) || (socket.data.clientId && q.clientId === socket.data.clientId)).length;
    if (mine >= state.settings.maxPerSinger) return ack({ error: `Hai già ${mine} canzoni in coda: aspetta di cantarne una.` });
    if (waiting().some((q) => yt.norm(q.title) === yt.norm(title) && yt.norm(q.artist) === yt.norm(artist))) return ack({ error: "Questa canzone è già in coda: scegline un'altra." });
    lastRequest.set(cid, Date.now());
    const item = addSong({ singer, title, artist, source: "guest", clientId: socket.data.clientId, selfie: data?.selfie, consentAt: Date.now() });
    ack({ ok: true, id: item.id, selfie: item.hasSelfie, position: waiting().findIndex((q) => q.id === item.id) + 1 });
  });

  socket.on("guest:cancel", (id, ack = () => {}) => {
    const q = find(id);
    if (!q || q.status !== "waiting" || !socket.data.clientId || q.clientId !== socket.data.clientId) return ack({ error: "Prenotazione non trovata." });
    deleteSelfie(q);
    state.queue = state.queue.filter((x) => x.id !== id);
    broadcast(); ack({ ok: true });
  });

  if (role === "screen") {
    socket.on("screen:status", (s) => {
      player = { videoId: s?.videoId || null, state: String(s?.state || "idle"), time: +s?.time || 0, duration: +s?.duration || 0, filler: { playing: !!s?.filler?.playing, title: String(s?.filler?.title || "").slice(0, 120), paused: !!s?.filler?.paused } };
      io.to("dj").volatile.emit("player", player);
    });
    socket.on("screen:error", ({ videoId, code }) => {
      const cur = current();
      if (!cur || cur.videoId !== videoId) return;
      cur.failed = [...new Set([...(cur.failed || []), videoId])];
      const nextOk = (cur.candidates || []).find((c) => !cur.failed.includes(c.id));
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
  socket.on("dj:remove", (id) => {
    const wasCurrent = current()?.id === id;
    deleteSelfie(find(id));
    state.queue = state.queue.filter((q) => q.id !== id);
    broadcast(); if (wasCurrent) cueCurrent();
  });
  socket.on("dj:hideSelfie", (id) => { deleteSelfie(find(id)); broadcast(); });
  socket.on("dj:move", ({ id, dir }) => {
    const w = waiting(); const i = w.findIndex((q) => q.id === id); const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= w.length) return;
    [w[i].pos, w[j].pos] = [w[j].pos, w[i].pos];
    if (w[i].pos === w[j].pos) w[i].pos += dir;
    broadcast();
  });
  socket.on("dj:top", (id) => { const q = find(id); if (q) { q.pos = minPos() - 1; broadcast(); } });
  socket.on("dj:next", () => {
    const cur = current(); if (cur) finish(cur, "done");
    const n = waiting()[0]; if (n) { n.status = "singing"; n.startedAt = Date.now(); }
    broadcast(); cueCurrent();
  });
  socket.on("dj:skip", () => { const cur = current(); if (cur) { finish(cur, "skipped"); broadcast(); cueCurrent(); } });
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
    if (typeof s?.showSelfies === "boolean") st.showSelfies = s.showSelfies;
    if (typeof s?.liveOverlay === "boolean") st.liveOverlay = s.liveOverlay;
    if (s?.filler) {
      const f = st.filler;
      if (typeof s.filler.enabled === "boolean") f.enabled = s.filler.enabled;
      if (s.filler.volume != null) f.volume = Math.min(100, Math.max(0, parseInt(s.filler.volume) || 0));
      if (s.filler.visibility != null) f.visibility = Math.min(90, Math.max(0, parseInt(s.filler.visibility) || 0));
      if (typeof s.filler.url === "string") {
        const p = parseFiller(s.filler.url);
        if (!p) { socket.emit("notice", "Il link della musica d'attesa non è un video o una playlist di YouTube."); }
        else Object.assign(f, p);
      }
    }
    if (s?.maxPerSinger) st.maxPerSinger = Math.min(10, Math.max(1, parseInt(s.maxPerSinger) || 2));
    if (s?.minutesPerSong) st.minutesPerSong = Math.min(10, Math.max(2, parseInt(s.minutesPerSong) || 4));
    broadcast();
  });
  socket.on("dj:reset", () => {
    state.queue = [];
    try { fs.rmSync(SELFIE_DIR, { recursive: true, force: true }); } catch {}
    broadcast(); cueCurrent();
  });
  socket.on("dj:player", (cmd) => io.to("screen").emit("player:cmd", cmd));
  socket.on("dj:filler", (cmd) => io.to("screen").emit("filler:cmd", cmd));
});

server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  console.log("\n🎤  Canta con Lopee J! è partito!\n");
  console.log(`   Regia (tu):         http://localhost:${PORT}/regia`);
  console.log(`   Schermo/proiettore: http://localhost:${PORT}/schermo`);
  ips.forEach((ip) => console.log(`   Ospiti (stessa Wi-Fi): http://${ip}:${PORT}/`));
  if (!process.env.DJ_PIN) console.log("\n⚠️  PIN regia predefinito: \"karaoke\". Impostane uno tuo (DJ_PIN).");
  if (!YT_KEY) console.log("⚠️  Nessuna chiave YouTube: la ricerca automatica è spenta, puoi incollare i link a mano.");
  console.log("");
});
