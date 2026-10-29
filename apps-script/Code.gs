// Hoja de la comunidad: guarda los ajustes de la fiesta, las puertas que reparten y los peques inscritos.
// Va dentro de la hoja de Google de cada comunidad (ver README).
// La clave del gestor se crea y se cambia desde el menú 🎃 Halloween de la hoja, y se guarda cifrada en
// las propiedades del script.
const APP = "halloween";

const DOORS = { name: "puertas", cols: ["id", "calle", "numero", "etiquetas"] };
const KIDS = { name: "peques", cols: ["id", "clave", "alias", "edad", "alergias", "creado", "actualizado"] };
const SETTINGS = { name: "ajustes", cols: ["ajuste", "valor"] };
// kids = tope del máximo de peques que puede poner el gestor (kidsMax, 100 si no dice nada);
// family = peques por inscripción; burst = altas de peques cada 10 minutos (frena inscripciones basura en masa).
const LIMITS = { alias: 40, age: 20, allergy: 80, kids: 500, kidsMax: 100, family: 10, burst: 30, doors: 2000, portals: 30, floors: 40, letters: 12, streets: 50 };
// Claves del gestor demasiado fáciles (también con números o signos delante o detrás: "halloween2026").
const COMMON_KEYS = ["password", "contrasena", "contraseña", "clave", "halloween", "qwerty", "abcdef", "abc", "gestor", "comunidad", "admin", "secreto", "secreta"];
const TAGS = ["gluten", "nuts", "lactose", "egg"];

// ---------- Entrada ----------

// Abrir la URL en el navegador muestra los datos públicos (útil para comprobar que funciona).
function doGet() {
  return json(publicData());
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let out;
  let slow = false;
  try {
    const req = JSON.parse(e.postData.contents);
    lock.waitLock(10000);
    out = handle(req);
  } catch (err) {
    out = { error: err.code || "server" };
    slow = !!err.slow;
    if (!err.code) console.error(err);
  } finally {
    lock.releaseLock();
  }
  // Frena a quien intente adivinar claves, sin dejar la hoja bloqueada a los demás mientras espera.
  if (slow) Utilities.sleep(1000);
  return json(out);
}

const ACTIONS = {
  public: () => publicData(),

  // El asistente de alta comprueba que la URL es una hoja de Halloween y si ya tiene gestor.
  ping: () => ({ app: APP, version: 1, claimed: !!props().getProperty("ADMIN_HASH") }),

  // Primera clave del gestor. Solo funciona una vez; después se cambia desde el menú de la hoja.
  claim(r) {
    if (props().getProperty("ADMIN_HASH")) fail("claimed");
    setKey(r.key);
    return { ok: true };
  },

  // Familias: inscriben a uno o varios peques de una vez. La clave privada (token) es de la inscripción:
  // con su enlace se cambian, añaden o quitan sus peques. En la web cada peque sale por separado.
  familyGet(r) {
    const list = family(r.token);
    if (!list.length) fail("notfound");
    return { kids: list.map(ownView) };
  },
  // kids = lista completa de la inscripción: con id se cambia, sin id se añade, el que falta se borra.
  familySave(r) {
    const wanted = Array.isArray(r.kids) ? r.kids : [];
    if (wanted.length > LIMITS.family) fail("toomany");
    const clean = wanted.map((k) => Object.assign({ id: String((k && k.id) || "") }, cleanKid(k || {})));
    let token = String(r.token || "");
    const mine = family(token);
    if (token && !mine.length) fail("notfound");
    if (!token) {
      if (!clean.length) fail("invalid");
      token = Utilities.getUuid().replace(/-/g, "");
    }
    const added = clean.filter((k) => !mine.some((m) => m.id === k.id));
    const removed = mine.filter((m) => !clean.some((k) => k.id === m.id));
    if (added.length) {
      if (kids().length - removed.length + added.length > maxKids()) fail("full");
      throttle(added.length);
    }
    const sh = table(KIDS);
    const now = new Date().toISOString();
    clean.forEach((k) => {
      const m = mine.find((x) => x.id === k.id);
      if (m) sh.getRange(m.row, 3, 1, 5).setValues([[k.alias, k.age, k.allergy, m.created, now]]);
    });
    removed.sort((a, b) => b.row - a.row).forEach((m) => sh.deleteRow(m.row));
    added.forEach((k) => sh.appendRow([Utilities.getUuid().slice(0, 8), token, k.alias, k.age, k.allergy, now, now]));
    return { token, kids: family(token).map(ownView) };
  },

  // Gestor: todo pide la clave.
  adminCheck(r) {
    admin(r);
    return { ok: true };
  },
  adminKids(r) {
    admin(r);
    return { kids: kids().map(({ id, alias, age, allergy }) => ({ id, alias, age, allergy })) };
  },
  adminKidDelete(r) {
    admin(r);
    const i = kids().findIndex((k) => k.id === r.id);
    if (i < 0) fail("notfound");
    table(KIDS).deleteRow(i + 2);
    return { ok: true };
  },
  // Nueva edición (otro año): vacía puertas y peques, conserva los ajustes.
  adminNewEdition(r) {
    admin(r);
    [DOORS, KIDS].forEach((t) => {
      const sh = table(t);
      if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
    });
    return { ok: true };
  },

  // Guarda ajustes y puertas de una vez.
  adminSave(r) {
    admin(r);
    if (r.settings) saveSettings(cleanSettings(r.settings));
    if (r.doors) saveDoors(r.doors);
    return { ok: true };
  },
};

function saveSettings(settings) {
  const rowsOut = Object.keys(settings).map((k) => [k, JSON.stringify(settings[k])]);
  const sh = table(SETTINGS);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  sh.getRange(2, 1, rowsOut.length, 2).setValues(rowsOut);
}

function saveDoors(list) {
  const doors = list.slice(0, LIMITS.doors).map((d) => [
    text(d.id, 80), text(d.street, 60), text(d.number, 10),
    (d.tags || []).filter((t) => TAGS.includes(t)).join(" "),
  ]).filter((d) => d[0]);
  const sh = table(DOORS);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, DOORS.cols.length).clearContent();
  if (doors.length) sh.getRange(2, 1, doors.length, DOORS.cols.length).setValues(doors);
}

function handle(req) {
  const action = ACTIONS[req && req.action];
  if (!action) fail("invalid");
  return action(req);
}

// ---------- Datos ----------

function publicData() {
  const saved = rows(SETTINGS);
  const settings = saved.length ? Object.fromEntries(saved.map(([k, v]) => [k, JSON.parse(v)])) : null;
  const doors = rows(DOORS).map(([id, street, number, tags]) =>
    ({ id, street, number, tags: tags ? tags.split(" ") : [] }));
  return { settings, doors, kids: kids().map(({ alias, age, allergy }) => ({ alias, age, allergy })) };
}

function kids() {
  return rows(KIDS).map(([id, token, alias, age, allergy, created], i) => ({ id, token, alias, age, allergy, created, row: i + 2 }));
}

// Peques de una inscripción (mismo token).
function family(token) {
  return token ? kids().filter((k) => k.token === String(token)) : [];
}

const ownView = ({ id, alias, age, allergy }) => ({ id, alias, age, allergy });

// Máximo de peques de la fiesta: lo pone el gestor (LIMITS.kidsMax si no ha dicho nada).
function maxKids() {
  const saved = rows(SETTINGS).find(([k]) => k === "kidsMax");
  const n = saved ? parseInt(JSON.parse(saved[1]), 10) : NaN;
  return Number.isNaN(n) ? LIMITS.kidsMax : Math.min(LIMITS.kids, Math.max(1, n));
}

// Cuenta las altas de peques de los últimos 10 minutos; si son demasiadas, pide esperar.
function throttle(n) {
  const cache = CacheService.getScriptCache();
  const slot = "altas-" + Math.floor(Date.now() / 6e5);
  const done = parseInt(cache.get(slot), 10) || 0;
  if (done + n > LIMITS.burst) fail("busy");
  cache.put(slot, String(done + n), 900);
}

function admin(r) {
  const saved = props().getProperty("ADMIN_HASH");
  if (!saved || hash(String(r.key || "")) !== saved) fail("auth", true);
}

// ---------- Clave del gestor ----------

function props() {
  return PropertiesService.getScriptProperties();
}

function hash(key) {
  let salt = props().getProperty("SALT");
  if (!salt) {
    salt = Utilities.getUuid();
    props().setProperty("SALT", salt);
  }
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + key, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

// Mínimo 10 caracteres; ni un carácter repetido, ni una serie de números, ni una palabra típica.
function weakKey(key) {
  const k = String(key || "");
  const bare = k.toLowerCase().replace(/^[\d\W_]+|[\d\W_]+$/g, "");
  return k.length < 10 || /^(.)\1+$/.test(k) || "01234567890".includes(k) || "9876543210".includes(k) || COMMON_KEYS.includes(bare);
}

function setKey(key) {
  if (weakKey(key)) fail("weakkey");
  props().setProperty("ADMIN_HASH", hash(String(key)));
}

function cleanKid(r) {
  const kid = { alias: text(r.alias, LIMITS.alias), age: text(r.age, LIMITS.age), allergy: text(r.allergy, LIMITS.allergy) };
  if (!kid.alias) fail("invalid");
  return kid;
}

// Ajustes del gestor. Misma lógica que js/settings.js.
function cleanSettings(s) {
  const b = s.buildings || {};
  const time = (v) => (/^\d{2}:\d{2}$/.test(v) ? v : "");
  const link = (v) => (/^https:\/\/\S+$/.test(v) ? String(v).slice(0, 500) : "");
  const int = (v, min, max) => Math.min(max, Math.max(min, parseInt(v, 10) || 0));
  const unique = (list) => list.filter((x, i) => list.indexOf(x) === i);
  const portals = (Array.isArray(b.portals) ? b.portals : []).slice(0, LIMITS.portals).map((p) => ({ street: text(p && p.street, 60) }));
  const letters = unique(String(b.letters || "").toUpperCase().replace(/[^A-Z]/g, "").split("")).slice(0, LIMITS.letters).join("");
  const streets = unique(((s.houses && s.houses.streets) || []).map((x) => text(x, 60)).filter(Boolean)).slice(0, LIMITS.streets);
  return {
    community: text(s.community, 60),
    date: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s.date) ? s.date : "",
    routeEnd: time(s.routeEnd),
    partyPlace: text(s.partyPlace, 60),
    partyStart: time(s.partyStart),
    partyEnd: time(s.partyEnd),
    whatsapp: link(s.whatsapp),
    volunteersForm: link(s.volunteersForm),
    layout: s.layout === "houses" ? "houses" : "buildings",
    buildings: {
      portals: portals.length ? portals : [{ street: "" }],
      floors: int(b.floors, 0, LIMITS.floors),
      ground: !!b.ground,
      letters: letters || "A",
    },
    houses: { streets },
    kidsMax: s.kidsMax == null || s.kidsMax === "" ? LIMITS.kidsMax : int(s.kidsMax, 1, LIMITS.kids),
  };
}

// Texto limpio y corto. Quita = + - @ del principio para que la hoja nunca lo trate como fórmula.
function text(v, max) {
  return String(v == null ? "" : v).trim().replace(/^[=+\-@]+/, "").slice(0, max);
}

// ---------- Hoja ----------

// Pestaña con cabecera; se crea sola la primera vez. Todo se guarda como texto.
function table(t) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(t.name);
  if (!sh) {
    sh = ss.insertSheet(t.name);
    sh.getRange(1, 1, 1, t.cols.length).setValues([t.cols]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.getRange("A:E").setNumberFormat("@");
  }
  return sh;
}

function rows(t) {
  const sh = table(t);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, t.cols.length).getDisplayValues();
}

// slow = la respuesta espera 1 s (intento fallido de clave o invitación).
function fail(code, slow) {
  const err = new Error(code);
  err.code = code;
  err.slow = !!slow;
  throw err;
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Menú de la hoja ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu("🎃 Halloween")
    .addItem("1. Activar la hoja", "activate")
    .addItem("Cambiar la clave del gestor", "changeKey")
    .addToUi();
}

// Pide los permisos, crea las pestañas y explica cómo publicar.
function activate() {
  setup();
  SpreadsheetApp.getUi().alert("✅ Hoja activada",
    "Ahora publícala para tu web:\n\n" +
    "1. Extensiones → Apps Script.\n" +
    "2. Arriba a la derecha: Implementar → Nueva implementación.\n" +
    "3. En ⚙️ elige «Aplicación web».\n" +
    "4. Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario.\n" +
    "5. Implementar → Autorizar acceso → copia la «URL de la aplicación web».\n\n" +
    "Pega esa URL en el asistente de alta de tu comunidad (o en comunidad.json si tienes tu propia copia de la web).",
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function changeKey() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt("Nueva clave del gestor", "Mínimo 10 caracteres y que no sea fácil de adivinar. Sirve para entrar en el panel del gestor de tu web.", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  try {
    setKey(res.getResponseText());
    ui.alert("✅ Clave cambiada.");
  } catch (err) {
    ui.alert("Clave demasiado fácil: usa al menos 10 caracteres y evita palabras típicas como «halloween» o «contraseña».");
  }
}

// Crea las pestañas (también lo hace «Activar la hoja»).
function setup() {
  table(SETTINGS);
  table(DOORS);
  table(KIDS);
}
