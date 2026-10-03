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
  // microfono a condensatore retrò, disegnato in verde lime
  let micN = 0;
  function micSVG() { const id = "micG" + (++micN); return `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><clipPath id="${id}"><path d="M39 40V21a11 11 0 0 1 22 0v19z"/></clipPath></defs><g fill="none" stroke="#8acb2c" stroke-linecap="round" stroke-linejoin="round"><path d="M29 57a21 6.5 0 0 1 42 0" stroke-width="2.6" opacity=".55"/><path d="M50 63.5V84M38 87h24" stroke-width="3.4"/><path d="M39 40V21a11 11 0 0 1 22 0v19z" fill="#141b0d" stroke-width="3"/><g clip-path="url(#${id})" stroke-width="1.6" opacity=".9"><path d="M30 14l30 30M30 22l30 30M30 30l30 30M30 6l30 30M38 2l30 30M70 14L40 44M70 22L40 52M70 6L40 36M62 2L32 32"/></g><path d="M39 44v20a4 4 0 0 0 4 4h14a4 4 0 0 0 4-4V44z" fill="#141b0d" stroke-width="3"/><path d="M45 68v4h10v-4" stroke-width="2.6"/><path d="M29 57a21 6.5 0 0 0 42 0" stroke-width="3"/><path d="M29.5 57l9.5-3M70.5 57l-9.5-3" stroke-width="1.6" opacity=".8"/></g><rect x="37.5" y="39" width="25" height="5.5" rx="1.5" fill="#8acb2c"/><circle cx="50" cy="51" r="2.4" fill="#8acb2c"/></svg>`; }
  return { $, esc, store, toast, fmtTime, setStatus, brandHTML, initials, avatarHTML, compressImage, micSVG };
})();
