// Ricerca delle basi karaoke su YouTube (YouTube Data API v3) e classifica dei risultati.
// Ogni ricerca costa 100 unità di quota (10.000 al giorno gratis = circa 100 ricerche),
// quindi i risultati vengono salvati in cache per non ripetere la stessa ricerca.

const fs = require("fs");
const path = require("path");

const API = "https://www.googleapis.com/youtube/v3";
const CACHE_FILE = path.join(__dirname, "..", "data", "cache.json");
const CACHE_TTL = 7 * 24 * 3600 * 1000;

// Canali noti per basi karaoke di buona qualità
const KARAOKE_CHANNELS = [
  "sing king", "karafun", "karaoke version", "zzang karaoke", "stingray karaoke",
  "karaoke fiesta", "the karaoke channel", "musisocial", "karaoke italia",
  "karaoke italiano", "midi karaoke", "base karaoke", "singplay", "lugn",
  "ameritz", "party tyme", "sunfly", "karaoke hub", "atomic karaoke"
];

let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); } catch { cache = {}; }
let cacheTimer = null;
function saveCache() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); } catch {}
  }, 500);
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function parseDuration(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

function videoIdFromUrl(raw) {
  const s = String(raw || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const h = u.hostname.replace(/^(www|m|music)\./, "");
    if (h === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (h === "youtube.com" || h === "youtube-nocookie.com") {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch {}
  return null;
}

// Punteggio: quanto un video è adatto al karaoke per la canzone richiesta
function scoreVideo(v, song) {
  const t = norm(v.title);
  const ch = norm(v.channel);
  let score = 0;
  const tags = [];

  if (/\bkaraoke\b/.test(t)) { score += 40; tags.push("Karaoke"); }
  if (/\b(lyrics|testo|with lyrics|lyric video|sing along)\b/.test(t)) { score += 15; tags.push("Testo"); }
  if (/\bbase\b/.test(t)) score += 12;
  if (/\b(instrumental|strumentale|backing track)\b/.test(t)) { score += 10; tags.push("Strumentale"); }
  if (KARAOKE_CHANNELS.some((c) => ch.includes(c))) { score += 25; tags.push("Canale karaoke"); }
  else if (ch.includes("karaoke")) score += 18;

  // Corrispondenza con titolo e artista richiesti
  const words = norm(song.title).split(" ").filter((w) => w.length > 1);
  if (words.length) score += Math.round(30 * words.filter((w) => t.includes(w)).length / words.length);
  const artist = norm(song.artist);
  if (artist && (t.includes(artist) || ch.includes(artist))) score += 10;

  // Penalità: versioni con voce, live, tutorial, remix…
  if (/\b(official (music )?video|videoclip|video ufficiale|official audio)\b/.test(t) && !/\bkaraoke\b/.test(t)) score -= 35;
  if (/\blive\b/.test(t)) { score -= 15; tags.push("Live"); }
  if (/\bcover\b/.test(t) && !/\bkaraoke\b/.test(t)) score -= 10;
  if (/\b(reaction|tutorial|lesson|lezione|how to|chords|accordi|guitar|chitarra)\b/.test(t)) score -= 40;
  if (/\b(remix|slowed|sped up|nightcore|8d|reverb)\b/.test(t)) score -= 25;
  if (/\b(lower|higher|key|tonalita|semitone|[+-]\d)\b/.test(t) && /\b(key|tonalita|semitone|lower|higher)\b/.test(t)) { score -= 6; tags.push("Tonalità modificata"); }
  if (/\b(with backing vocals|cori)\b/.test(t)) tags.push("Con cori");

  if (v.duration) {
    if (v.duration < 90) score -= 50;
    else if (v.duration > 600) score -= 20;
  }
  return { score, tags: [...new Set(tags)] };
}

async function api(endpoint, params, key) {
  const url = `${API}/${endpoint}?` + new URLSearchParams({ ...params, key });
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason || "";
    const err = new Error(body?.error?.message || `YouTube ha risposto ${res.status}`);
    err.code = /quota/i.test(reason) ? "quota" : /key|forbidden|invalid/i.test(reason) ? "key" : "api";
    throw err;
  }
  return body;
}

async function details(ids, key) {
  if (!ids.length) return {};
  const body = await api("videos", { part: "contentDetails,status,snippet", id: ids.join(","), maxResults: 50 }, key);
  const out = {};
  for (const it of body.items || []) {
    out[it.id] = {
      duration: parseDuration(it.contentDetails?.duration),
      embeddable: it.status?.embeddable !== false,
      title: decode(it.snippet?.title),
      channel: decode(it.snippet?.channelTitle),
      thumb: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || ""
    };
  }
  return out;
}

// Cerca le basi per una canzone; restituisce i candidati ordinati dal più adatto
async function searchKaraoke(song, key, customQuery) {
  const query = (customQuery && customQuery.trim()) || `${song.artist || ""} ${song.title} karaoke`.trim();
  const ck = norm(query);
  const hit = cache[ck];
  if (hit && Date.now() - hit.at < CACHE_TTL) return { query, candidates: rank(hit.items, song), cached: true };
  if (!key) { const e = new Error("Chiave YouTube mancante"); e.code = "nokey"; throw e; }

  const body = await api("search", {
    part: "snippet", q: query, type: "video", videoEmbeddable: "true",
    maxResults: 15, regionCode: "IT", safeSearch: "none"
  }, key);
  const ids = (body.items || []).map((it) => it.id?.videoId).filter(Boolean);
  const det = await details(ids, key);
  const items = ids.map((id) => ({ id, ...det[id] })).filter((v) => v.title && v.embeddable);
  cache[ck] = { at: Date.now(), items };
  saveCache();
  return { query, candidates: rank(items, song), cached: false };
}

function rank(items, song) {
  return items
    .map((v) => ({ ...v, ...scoreVideo(v, song) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

// Un link incollato a mano dal DJ diventa un candidato
async function candidateFromUrl(raw, key, song) {
  const id = videoIdFromUrl(raw);
  if (!id) return null;
  let v = { id, title: "Video scelto a mano", channel: "", duration: 0, thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` };
  if (key) {
    try { const d = (await details([id], key))[id]; if (d) v = { id, ...d }; } catch {}
  }
  return { ...v, ...scoreVideo(v, song), manual: true };
}

module.exports = { searchKaraoke, candidateFromUrl, videoIdFromUrl, scoreVideo, norm };
