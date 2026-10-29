// Conexión con la hoja de Google de la comunidad (apps-script/Code.gs).
// Su URL está en comunidad.json (ver README). Sin ese archivo funciona en modo demostración:
// las mismas acciones, guardadas en este navegador.
import { applySettings, config } from "./config.js";
import { cleanSettings, text } from "./settings.js";
import { demoData } from "./data/demo.js";
import { layout } from "./layouts/index.js";

const params = new URLSearchParams(location.search);
export const site = { demo: false, api: "" };

// Datos públicos que pinta la web.
export const data = { doors: [], kids: [] };

export class ApiError extends Error {
  constructor(code) { super(code); this.code = code; }
}

async function post(url, action, body = {}) {
  let res;
  try {
    // text/plain evita la petición previa de CORS, que Apps Script no admite.
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, ...body }) });
  } catch {
    throw new ApiError("network");
  }
  if (!res.ok) throw new ApiError("network");
  let out;
  try { out = await res.json(); } catch { throw new ApiError("badapi"); }
  if (out.error) throw new ApiError(out.error);
  return out;
}

export const api = (action, body) => (site.demo ? local(action, body || {}) : post(site.api, action, body));

// Lee comunidad.json: { "hoja": "https://script.google.com/macros/s/…/exec" }.
let connected = null;
export function connect() {
  connected ||= fetch("comunidad.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((c) => {
      site.api = String(c.hoja || "").trim();
      site.demo = !site.api;
    });
  return connected;
}

// Ajustes + puertas + peques. Se guardan en el navegador para pintar al instante la próxima visita.
const CACHE = "halloween-cache";
const set = params.get("layout") === "houses" ? "houses" : "buildings";

function use(out) {
  applySettings(out.settings);
  data.doors = out.doors.filter((d) => layout().fits(d));
  data.kids = out.kids;
}

export function loadCached() {
  try {
    const out = JSON.parse(localStorage.getItem(CACHE));
    if (out) { use(out); return true; }
  } catch {}
  return false;
}

export async function loadPublic() {
  const out = await api("public");
  use(out);
  if (!site.demo) try { localStorage.setItem(CACHE, JSON.stringify(out)); } catch {}
}

// ---------- Modo demostración ----------
// Imita apps-script/Code.gs (mismas acciones, límites y errores). Clave del gestor: "demo".
// ?layout=houses abre la demo de casas (otro conjunto de datos).
const KEY = `halloween-demo2-${set}`;
const LIMITS = { alias: 40, age: 20, allergy: 80, family: 10 };
const TAGS = ["gluten", "nuts", "lactose", "egg"];

function store() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) return saved;
  } catch {}
  const seed = structuredClone(demoData[set]);
  seed.kids = seed.kids.map((k, i) => ({ ...k, id: `demo${i}`, token: `demo${i}` }));
  return seed;
}

function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
}

const cleanKid = (b) => ({ alias: text(b.alias, LIMITS.alias), age: text(b.age, LIMITS.age), allergy: text(b.allergy, LIMITS.allergy) });
const publicKid = ({ alias, age, allergy }) => ({ alias, age, allergy });
const ownKid = ({ id, alias, age, allergy }) => ({ id, alias, age, allergy });
const random = () => Math.random().toString(36).slice(2, 10);

function local(action, b) {
  const db = store();
  const family = () => (b.token ? db.kids.filter((k) => k.token === b.token) : []);
  const admin = () => { if (b.key !== "demo") throw new ApiError("auth"); };

  switch (action) {
    case "public":
      return { settings: db.settings, doors: db.doors, kids: db.kids.map(publicKid) };
    case "familyGet": {
      const mine = family();
      if (!mine.length) throw new ApiError("notfound");
      return { kids: mine.map(ownKid) };
    }
    case "familySave": {
      const wanted = Array.isArray(b.kids) ? b.kids : [];
      if (wanted.length > LIMITS.family) throw new ApiError("toomany");
      const clean = wanted.map((k) => ({ id: String(k.id || ""), ...cleanKid(k) }));
      if (clean.some((k) => !k.alias)) throw new ApiError("invalid");
      const mine = family();
      if (b.token && !mine.length) throw new ApiError("notfound");
      if (!b.token && !clean.length) throw new ApiError("invalid");
      const token = b.token || random() + random();
      const added = clean.filter((k) => !mine.some((m) => m.id === k.id));
      const removed = mine.filter((m) => !clean.some((k) => k.id === m.id));
      if (added.length && db.kids.length - removed.length + added.length > (db.settings?.kidsMax ?? config.kidsMax)) throw new ApiError("full");
      clean.forEach((k) => { const m = mine.find((x) => x.id === k.id); if (m) Object.assign(m, cleanKid(k)); });
      db.kids = db.kids.filter((k) => !removed.includes(k));
      added.forEach((k) => db.kids.push({ ...cleanKid(k), id: random(), token }));
      save(db);
      return { token, kids: db.kids.filter((k) => k.token === token).map(ownKid) };
    }
    case "adminCheck":
      admin();
      return { ok: true };
    case "adminKids":
      admin();
      return { kids: db.kids.map(({ id, alias, age, allergy }) => ({ id, alias, age, allergy })) };
    case "adminKidDelete":
      admin();
      db.kids = db.kids.filter((k) => k.id !== b.id);
      save(db);
      return { ok: true };
    case "ping":
      return { app: "halloween", version: 1, claimed: true };
    case "adminNewEdition":
      admin();
      db.doors = [];
      db.kids = [];
      save(db);
      return { ok: true };
    case "adminSave":
      admin();
      if (b.settings) db.settings = cleanSettings(b.settings);
      if (b.doors) {
        db.doors = b.doors.map((d) => ({
          id: text(d.id, 80), street: text(d.street, 60), number: text(d.number, 10),
          tags: (d.tags || []).filter((tag) => TAGS.includes(tag)),
        })).filter((d) => d.id);
      }
      save(db);
      return { ok: true };
    default:
      throw new ApiError("invalid");
  }
}
