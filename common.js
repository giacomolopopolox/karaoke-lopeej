// Funzioni comuni a tutte le pagine
window.K = (function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };
  function toast(msg, ms = 2600) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
  }
  const fmtTime = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  function setStatus(on, text) {
    const d = $("#dot"), t = $("#statusText");
    if (d) d.className = "dot " + (on ? "live" : "off");
    if (t) t.textContent = text;
  }
  // Nome della serata: "Lopee J" diventa il logo
  function brandHTML(name) {
    const n = String(name || "Canta con Lopee J!");
    const m = n.match(/^(.*?)lopee\s*j(.*)$/i);
    if (!m) return `<span>${esc(n)}</span>`;
    const before = m[1].trim(), after = m[2].trim();
    return `${before ? `<span>${esc(before)}</span>` : ""}<img class="logo" src="/logo.png" alt="Lopee J">${after ? `<span class="bang">${esc(after)}</span>` : ""}`;
  }
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
  function avatarHTML(item, cls = "avatar") {
    return item.selfie
      ? `<span class="${cls}" style="background-image:url('${esc(item.selfie)}')" role="img" aria-label="Selfie di ${esc(item.singer)}"></span>`
      : `<span class="${cls}" aria-hidden="true">${esc(initials(item.singer))}</span>`;
  }
  // Selfie: ritaglio quadrato al centro, 480 px, JPEG leggero (circa 40-80 KB)
  function compressImage(file, size = 480) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        const c = document.createElement("canvas"); c.width = c.height = size;
        c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("immagine")); };
      img.src = url;
    });
  }
  return { $, esc, store, toast, fmtTime, setStatus, brandHTML, initials, avatarHTML, compressImage };
})();
