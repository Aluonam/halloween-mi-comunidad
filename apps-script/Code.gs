// Hoja de la comunidad: guarda los ajustes de la fiesta, las puertas que reparten y los peques inscritos.
// Va dentro de la hoja de Google de cada comunidad (ver README).
// La clave del gestor se crea y se cambia desde el menú 🎃 Halloween de la hoja, y se guarda cifrada en
// las propiedades del script.
const APP = "halloween";

const DOORS = { name: "puertas", cols: ["id", "calle", "numero", "etiquetas"] };
const KIDS = { name: "peques", cols: ["id", "clave", "alias", "edad", "alergias", "creado", "actualizado"] };
const SETTINGS = { name: "ajustes", cols: ["ajuste", "valor"] };
const LIMITS = { alias: 40, age: 20, allergy: 80, kids: 500, doors: 2000, portals: 30, floors: 40, letters: 12, streets: 50 };
const TAGS = ["gluten", "nuts", "lactose", "egg"];

// ---------- Entrada ----------

// Abrir la URL en el navegador muestra los datos públicos (útil para comprobar que funciona).
function doGet() {
  return json(publicData());
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    lock.waitLock(10000);
    out = handle(req);
  } catch (err) {
    out = { error: err.code || "server" };
    if (!err.code) console.error(err);
  } finally {
    lock.releaseLock();
  }
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

  // Familias: crean su inscripción y la cambian o borran con su clave privada.
  kidCreate(r) {
    const kid = cleanKid(r);
    const sh = table(KIDS);
    if (sh.getLastRow() - 1 >= LIMITS.kids) fail("full");
    const id = Utilities.getUuid().slice(0, 8);
    const token = Utilities.getUuid().replace(/-/g, "");
    const now = new Date();
    sh.appendRow([id, token, kid.alias, kid.age, kid.allergy, now, now]);
    return { id, token };
  },
  kidGet(r) {
    const { kid } = ownKid(r);
    return { alias: kid.alias, age: kid.age, allergy: kid.allergy };
  },
  kidUpdate(r) {
    const { row } = ownKid(r);
    const kid = cleanKid(r);
    table(KIDS).getRange(row, 3, 1, 5).setValues([[kid.alias, kid.age, kid.allergy, cell(row, 6), new Date()]]);
    return { ok: true };
  },
  kidDelete(r) {
    table(KIDS).deleteRow(ownKid(r).row);
    return { ok: true };
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
  return rows(KIDS).map(([id, token, alias, age, allergy]) => ({ id, token, alias, age, allergy }));
}

function ownKid(r) {
  const list = kids();
  const i = list.findIndex((k) => k.id === r.id && k.token === r.token && r.token);
  if (i < 0) fail("notfound");
  return { kid: list[i], row: i + 2 };
}

function admin(r) {
  const saved = props().getProperty("ADMIN_HASH");
  if (!saved || hash(String(r.key || "")) !== saved) {
    Utilities.sleep(1000); // frena a quien intente adivinar la clave
    fail("auth");
  }
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

function setKey(key) {
  if (String(key || "").length < 6) fail("weakkey");
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

function cell(row, col) {
  return table(KIDS).getRange(row, col).getValue();
}

function fail(code) {
  const err = new Error(code);
  err.code = code;
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
  const res = ui.prompt("Nueva clave del gestor", "Mínimo 6 caracteres. Sirve para entrar en el panel del gestor de tu web.", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  try {
    setKey(res.getResponseText());
    ui.alert("✅ Clave cambiada.");
  } catch (err) {
    ui.alert("La clave debe tener al menos 6 caracteres.");
  }
}

// Crea las pestañas (también lo hace «Activar la hoja»).
function setup() {
  table(SETTINGS);
  table(DOORS);
  table(KIDS);
}
