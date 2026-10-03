// CTS Case Report — free Cloudflare Worker
// Serves the app (static assets) and stores shared reports in KV for 30 days.
// POST /api/reports  -> { id, url }      (no login; unguessable id)
// GET  /r/:id        -> read-only report page with photos (works in any browser / chat app preview)
// GET  /r/:id/p/:n   -> photo n (JPEG)

const TTL = 60 * 60 * 24 * 30;          // 30 days
const MAX_BODY = 20 * 1024 * 1024;      // 20 MB per report
const MAX_PHOTOS = 12;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...CORS } });
const newId = () => {
  const a = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(b, (x) => a[x % a.length]).join("");
};
const clip = (s, n) => String(s ?? "").slice(0, n);

async function createReport(req, env, origin) {
  const len = +req.headers.get("content-length") || 0;
  if (len > MAX_BODY) return json({ error: "Report is too large. Remove some photos and try again." }, 413);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid report data." }, 400); }
  const r = body && body.report;
  if (!r || typeof r !== "object") return json({ error: "Missing report." }, 400);

  const photos = Array.isArray(body.photos) ? body.photos.slice(0, MAX_PHOTOS) : [];
  const id = newId();
  const meta = {
    v: 1,
    created: Date.now(),
    tz: clip(body.tz, 64),
    line: clip(body.line, 120),
    eng: clip(body.eng, 120),
    report: {
      hospital: clip(r.hospital, 300), instance: clip(r.instance, 120), serial: clip(r.serial, 120),
      note: clip(r.note, 20000), caseNo: clip(r.caseNo, 120), caseAt: +r.caseAt || 0,
      status: clip(r.status, 20), statusLabel: clip(r.statusLabel, 40), created: +r.created || 0,
      log: (Array.isArray(r.log) ? r.log : []).slice(0, 300).map((l) => ({ t: +l.t || 0, m: clip(l.m, 500), k: !!l.k })),
    },
    photos: [],
  };
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(p && p.d || "");
    if (!m) continue;
    const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    await env.REPORTS.put(`${id}:p${meta.photos.length}`, bin, { expirationTtl: TTL, metadata: { type: "image/" + m[1] } });
    meta.photos.push({ t: +p.t || 0, type: "image/" + m[1] });
  }
  await env.REPORTS.put(id, JSON.stringify(meta), { expirationTtl: TTL });
  return json({ id, url: `${origin}/r/${id}`, expires: Date.now() + TTL * 1000 });
}

const pad = (n) => String(n).padStart(2, "0");
function stamp(t, tz) {
  if (!t) return "—";
  try {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
  } catch { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`; }
}

function reportPage(id, m, origin) {
  const r = m.report, tz = m.tz;
  const title = `CTS Case ${r.caseNo || "(pending)"} – ${r.hospital || "Hospital"}`;
  const desc = `S/N ${r.serial || "—"} · Instance ${r.instance || "—"} · ${m.photos.length} photo(s)`;
  const rows = [
    ["Case No.", r.caseNo || "Not yet issued"], ["Case issued", r.caseAt ? stamp(r.caseAt, tz) + (tz ? " " + tz : "") : "—"],
    ["Status", r.statusLabel || r.status || "—"], ["Hospital", r.hospital || "—"], ["Instance No.", r.instance || "—"],
    ["Serial No.", r.serial || "—"], ["CTS line", m.line || "—"], ["Reported by", m.eng || "—"], ["Created", stamp(r.created, tz)],
  ];
  const og = m.photos.length ? `<meta property="og:image" content="${origin}/r/${id}/p/0">` : `<meta property="og:image" content="${origin}/icons/icon-512.png">`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex,nofollow">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">${og}<meta name="twitter:card" content="summary_large_image">
<style>
:root{--bg:#eef1f3;--s:#fff;--ink:#14232e;--mu:#5b6b77;--ln:#d3dbe1;--ac:#0d5c7a}
@media (prefers-color-scheme:dark){:root{--bg:#0d151b;--s:#16222b;--ink:#e6edf2;--mu:#93a5b2;--ln:#2a3a46;--ac:#4fb3d9;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.w{max-width:760px;margin:0 auto;padding:16px}
header{background:var(--ac);color:#fff;border-radius:12px;padding:18px}
header h1{margin:0;font-size:1.3rem;line-height:1.25}header p{margin:6px 0 0;opacity:.9;font-size:.9rem}
.c{background:var(--s);border:1px solid var(--ln);border-radius:12px;padding:16px;margin-top:14px}
h2{font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--mu);margin:0 0 10px}
dl{display:grid;grid-template-columns:minmax(100px,max-content) 1fr;gap:8px 14px;margin:0}dt{color:var(--mu)}dd{margin:0;overflow-wrap:anywhere;font-weight:500}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.note{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
ul{list-style:none;margin:0;padding:0}li{display:grid;grid-template-columns:auto 1fr;gap:12px;padding:7px 0;border-top:1px solid var(--ln)}li:first-child{border:0}
time{font:13px ui-monospace,Menlo,monospace;color:var(--mu);white-space:nowrap}li.k span{font-weight:600;color:var(--ac)}
.ph{display:grid;gap:12px}.ph figure{margin:0}.ph img{width:100%;border-radius:8px;border:1px solid var(--ln);display:block}.ph figcaption{font-size:.8rem;color:var(--mu);margin-top:4px}
footer{color:var(--mu);font-size:.8rem;margin:18px 0 8px;text-align:center}footer a{color:var(--ac)}
</style></head><body><div class="w">
<header><h1>${esc(title)}</h1><p>Beckman Coulter customer case report · ${esc(desc)}</p></header>
<section class="c"><h2>Instrument & case</h2><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd class="${/No\.|issued|Created/.test(k) ? "mono" : ""}">${esc(v)}</dd>`).join("")}</dl></section>
<section class="c"><h2>Note</h2><p class="note">${esc(r.note || "—")}</p></section>
${m.photos.length ? `<section class="c"><h2>Photos (${m.photos.length})</h2><div class="ph">${m.photos.map((p, i) => `<figure><a href="/r/${id}/p/${i}" target="_blank" rel="noopener"><img src="/r/${id}/p/${i}" alt="Photo ${i + 1}" loading="lazy"></a><figcaption>Photo ${i + 1} · ${esc(stamp(p.t, tz))}</figcaption></figure>`).join("")}</div></section>` : ""}
<section class="c"><h2>Log</h2><ul>${r.log.map((l) => `<li class="${l.k ? "k" : ""}"><time>${esc(stamp(l.t, tz))}</time><span>${esc(l.m)}</span></li>`).join("")}</ul></section>
<footer>Shared ${esc(stamp(m.created, tz))} · link expires after 30 days · made with <a href="/">CTS Case Report</a> (free, no login)</footer>
</div></body></html>`;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = url.origin;
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) return new Response(null, { headers: CORS });
    if (url.pathname === "/api/reports" && req.method === "POST") return createReport(req, env, origin);

    let m = /^\/r\/([A-Za-z0-9]{8,32})\/p\/(\d{1,2})$/.exec(url.pathname);
    if (m && req.method === "GET") {
      const { value, metadata } = await env.REPORTS.getWithMetadata(`${m[1]}:p${m[2]}`, "arrayBuffer");
      if (!value) return new Response("Photo not found or expired", { status: 404 });
      return new Response(value, { headers: { "Content-Type": (metadata && metadata.type) || "image/jpeg", "Cache-Control": "public, max-age=86400", "X-Robots-Tag": "noindex" } });
    }
    m = /^\/r\/([A-Za-z0-9]{8,32})\/?$/.exec(url.pathname);
    if (m && req.method === "GET") {
      const raw = await env.REPORTS.get(m[1]);
      if (!raw) return new Response("<!doctype html><meta name=viewport content='width=device-width'><body style='font:16px system-ui;padding:24px'><h1>Report not found</h1><p>This link has expired (30 days) or is incorrect. Ask the sender to share the report again.</p>", { status: 404, headers: { "Content-Type": "text/html;charset=utf-8" } });
      return new Response(reportPage(m[1], JSON.parse(raw), origin), { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex" } });
    }
    return env.ASSETS.fetch(req);
  },
};
