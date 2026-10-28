// Panel del gestor: ajustes de la fiesta (fecha, edificios o casas, calles...), quién reparte chuches
// y revisión de las inscripciones de peques. Solo en español. La clave se comprueba en la hoja (apps-script/Code.gs).
import { applySettings, config, SETTINGS } from "./config.js";
import { api, connect, site } from "./api.js";
import { qrSvg, shareLink } from "./share.js";
import { setLang } from "./i18n.js";
import { layout } from "./layouts/index.js";
import { cleanSettings, LIMITS } from "./settings.js";
import { ALLERGY, esc } from "./sections/ui.js";

setLang("es");
const TAG_NAMES = { gluten: "sin gluten", nuts: "sin frutos secos", lactose: "sin lactosa", egg: "sin huevo" };
const SESSION = "halloween-admin";
const home = `./${location.search}`;

const root = document.getElementById("admin");
let key = "";
let doors = [];      // copia de trabajo de las puertas; los ajustes se editan directamente en config
let kids = [];
let selected = null; // id de la puerta abierta en el editor (edificios)
let dirty = false;
let status = "";
let settingsOpen = false;

try { key = sessionStorage.getItem(SESSION) || ""; } catch {}

const byId = () => Object.fromEntries(doors.map((d) => [d.id, d]));
const lost = () => doors.filter((d) => !layout().fits(d));
const errorText = (e) => ({
  auth: "Clave incorrecta.",
  network: "No se pudo conectar con la hoja.",
  badapi: "La URL de comunidad.json no responde como una hoja de Halloween.",
})[e.code] || `Error: ${e.code || e.message}`;
const settings = () => Object.fromEntries(SETTINGS.map((k) => [k, config[k]]));

// ---------- Pantallas ----------

function login(error = "") {
  root.innerHTML = `
    <section class="card login">
      <h1>🧙 Gestor</h1>
      <form id="login">
        <label>Clave del gestor<input type="password" name="key" required autocomplete="current-password"></label>
        <button class="btn">Entrar</button>
      </form>
      ${error ? `<p class="error">${error}</p>` : ""}
      ${site.demo ? `<p class="soon">Modo demostración: la clave es <b>demo</b>.</p>` : ""}
      <p><a href="${home}">← Volver a la web</a></p>
      ${site.demo ? "" : `<p class="help">¿Primera vez o has olvidado la clave? Créala o cámbiala desde tu hoja de Google: menú 🎃 Halloween → Cambiar la clave del gestor.</p>`}
    </section>`;
}

// Campo de ajuste. data-set="ruta.en.config"; data-rebuild = repinta el panel al cambiar (cambia la estructura).
const field = (label, path, value, attrs = "", rebuild = false) =>
  `<label>${label}<input data-set="${path}" value="${esc(value ?? "")}" ${attrs} ${rebuild ? "data-rebuild" : ""}></label>`;

function generalForm() {
  const [day = "", time = ""] = (config.date || "").split("T");
  return `
    <div class="grid">
      ${field("Nombre de la comunidad", "community", config.community, 'maxlength="60" required')}
      <label>Día<input type="date" data-date="day" value="${day}"></label>
      <label>Hora de inicio<input type="time" data-date="time" value="${time}"></label>
      ${field("Fin del recorrido (opcional)", "routeEnd", config.routeEnd, 'type="time"')}
    </div>
    <h3>Minifiesta</h3>
    <div class="grid">
      ${field("Lugar (vacío = no hay minifiesta)", "partyPlace", config.partyPlace, 'maxlength="60" placeholder="Sala común"')}
      ${field("Empieza", "partyStart", config.partyStart, 'type="time"')}
      ${field("Termina", "partyEnd", config.partyEnd, 'type="time"')}
    </div>
    <h3>Enlaces</h3>
    <div class="grid">
      ${field("Grupo de WhatsApp", "whatsapp", config.whatsapp, 'type="url" placeholder="https://chat.whatsapp.com/..."')}
      ${field("Formulario de voluntarios (opcional)", "volunteersForm", config.volunteersForm, 'type="url" placeholder="https://..."')}
    </div>`;
}

function structureForm() {
  const houses = config.layout === "houses";
  const b = config.buildings;
  return `
    <div class="choice">
      <label class="option ${houses ? "" : "on"}"><input type="radio" name="layout" value="buildings" ${houses ? "" : "checked"}> 🏢 Edificios <small>portales con pisos y letras</small></label>
      <label class="option ${houses ? "on" : ""}"><input type="radio" name="layout" value="houses" ${houses ? "checked" : ""}> 🏡 Casas <small>calle y número</small></label>
    </div>
    ${houses ? `
      <p class="help">Calles participantes, en el orden del recorrido.</p>
      <ol class="street-list">${config.houses.streets.map((s, i) => `
        <li><input data-street="${i}" value="${esc(s)}" maxlength="60" aria-label="Calle ${i + 1}">
          <button type="button" class="btn danger small" data-act="street-remove" data-i="${i}">Quitar</button></li>`).join("")}
      </ol>
      <form id="add-street" class="inline-form">
        <input name="street" maxlength="60" placeholder="Nombre de la nueva calle" required aria-label="Nueva calle">
        <button class="btn alt">➕ Añadir calle</button>
      </form>` : `
      <div class="grid">
        ${field("Nº de portales", "buildings.portals", b.portals.length, `type="number" min="1" max="${LIMITS.portals}"`, true)}
        ${field("Pisos (sin contar el bajo)", "buildings.floors", b.floors, `type="number" min="0" max="${LIMITS.floors}"`, true)}
        ${field("Letras de cada planta", "buildings.letters", b.letters, `maxlength="${LIMITS.letters}" pattern="[A-Za-z]+" placeholder="ABCD"`, true)}
        <label class="check"><input type="checkbox" data-set="buildings.ground" data-rebuild ${b.ground ? "checked" : ""}> Hay viviendas en el bajo</label>
      </div>
      <p class="help">Calle o dirección de cada portal (opcional):</p>
      <div class="grid">${b.portals.map((p, i) => field(`Portal ${i + 1}`, `buildings.portals.${i}.street`, p.street, 'maxlength="60" placeholder="Calle del Olmo 5"')).join("")}</div>`}`;
}

function tagBoxes(door) {
  return Object.entries(TAG_NAMES).map(([tag, label]) => `
    <label class="tag"><input type="checkbox" data-tag="${esc(door.id)}" value="${tag}" ${door.tags?.includes(tag) ? "checked" : ""}> ${ALLERGY[tag]} ${label}</label>`).join("");
}

// Edificios: se toca la ventana para encenderla; la encendida se edita debajo.
function buildingsEditor() {
  const map = byId();
  const ui = {
    doors,
    playing: true, // las ventanas apagadas son botones
    shown: (id) => map[id],
    lit: (door, label) => `<button type="button" class="win on ${door.id === selected ? "sel" : ""}" data-door="${esc(door.id)}" aria-label="${esc(layout().name(door))}">🎃<span class="lt">${label}</span>${(door.tags || []).length ? `<span class="badge">${door.tags.map((t) => ALLERGY[t]).join("")}</span>` : ""}</button>`,
    guess: (id, aria, label) => `<button type="button" class="win" data-door="${esc(id)}" aria-label="${aria}">${label}</button>`,
    off: (label) => `<span class="win">${label}</span>`,
  };
  const door = map[selected];
  return `
    <p class="help">Toca una ventana para encenderla 🎃 (esa puerta reparte). Toca una encendida para editarla o quitarla.</p>
    <div class="buildings admin-buildings">${layout().scene(ui)}</div>
    ${door ? `
      <div class="editor">
        <p><b>🎃 ${esc(layout().name(door))}</b></p>
        <div class="tags">${tagBoxes(door)}</div>
        <button type="button" class="btn alt" data-act="close">Listo</button>
        <button type="button" class="btn danger" data-act="remove" data-id="${esc(door.id)}">Quitar puerta</button>
      </div>` : ""}`;
}

// Casas: formulario para añadir y lista para quitar.
function housesEditor() {
  const { streets } = config.houses;
  const list = layout().sort(doors.filter((d) => layout().fits(d)));
  return `
    <form id="add-house" class="add-house">
      ${streets.length
        ? `<label>Calle<select name="street">${streets.map((s) => `<option>${esc(s)}</option>`).join("")}</select></label>`
        : `<label>Calle<input name="street" maxlength="60" autocomplete="off" placeholder="Añade las calles en Configuración"></label>`}
      <label>Número<input name="number" required maxlength="10" autocomplete="off" placeholder="12"></label>
      <div class="tags">${Object.entries(TAG_NAMES).map(([tag, label]) => `<label class="tag"><input type="checkbox" name="tags" value="${tag}"> ${ALLERGY[tag]} ${label}</label>`).join("")}</div>
      <button class="btn">➕ Añadir casa</button>
    </form>
    ${list.length ? `
      <ul class="house-list">${list.map((d) => `
        <li>
          <b>🎃 ${esc(layout().name(d))}</b>
          <div class="tags">${tagBoxes(d)}</div>
          <button type="button" class="btn danger small" data-act="remove" data-id="${esc(d.id)}">Quitar</button>
        </li>`).join("")}</ul>` : `<p class="soon">Todavía no hay casas. Añade la primera arriba.</p>`}`;
}

function kidsList() {
  if (!kids.length) return `<p class="soon">Todavía no hay peques inscritos.</p>`;
  return `
    <table class="kid-table">
      <thead><tr><th>Alias</th><th>Edad</th><th>Alergias</th><th></th></tr></thead>
      <tbody>${kids.map((k) => `
        <tr><td>${esc(k.alias)}</td><td>${esc(k.age)}</td><td>${esc(k.allergy)}</td>
          <td><button type="button" class="btn danger small" data-act="kid-delete" data-id="${esc(k.id)}">Borrar</button></td></tr>`).join("")}
      </tbody>
    </table>`;
}

function bar() {
  return `
    <span>${status || (dirty ? "Cambios sin guardar" : "")}</span>
    ${dirty ? `<button type="button" class="btn" data-act="save">💾 Guardar</button>` : ""}`;
}
function updateBar() {
  const el = root.querySelector(".savebar");
  if (!el) return;
  el.innerHTML = bar();
  el.classList.toggle("show", dirty || !!status);
}

function panel() {
  const houses = config.layout === "houses";
  const gone = lost();
  const shown = doors.length - gone.length;
  // Conserva el scroll y el foco al repintar.
  const y = scrollY;
  root.innerHTML = `
    <header class="admin-head">
      <h1>🧙 Gestor</h1>
      <p>${esc(config.community)} · <a href="${home}" target="_blank">Ver la web</a> · <button type="button" class="link" data-act="logout">Salir</button></p>
      ${site.demo ? `<p class="banner">🧪 Modo demostración: los cambios solo se guardan en este navegador.</p>` : ""}
    </header>

    <section class="card share">
      <div>
        <h2>Tu web</h2>
        <p>Comparte este enlace con los vecinos (o imprime el QR para el portal):</p>
        <p class="share-link"><a href="${esc(shareLink())}" target="_blank">${esc(shareLink())}</a></p>
        <button type="button" class="btn alt small" data-act="copy-link">🔗 Copiar enlace</button>
        <a class="btn alt small" download="qr-halloween.svg" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(shareLink()))}">⬇️ Descargar QR</a>
      </div>
      <div class="qr">${qrSvg(shareLink())}</div>
    </section>

    <details class="card settings" ${settingsOpen || !config.community ? "open" : ""}>
      <summary><h2>⚙️ Configuración</h2><span class="help">Nombre, fecha y hora, edificios o casas, calles...</span></summary>
      <h3>La fiesta</h3>
      ${generalForm()}
      <h3>Tipo de urbanización</h3>
      ${structureForm()}
      <h3>Nueva edición</h3>
      <p class="help">¿Otro año? Vacía las puertas y las inscripciones de peques y conserva esta configuración.</p>
      <button type="button" class="btn danger" data-act="new-edition">🧹 Empezar nueva edición</button>
    </details>

    <section class="card">
      <h2>Quién reparte</h2>
      <p class="count">🎃 ${shown} ${houses ? "casas" : "puertas"}</p>
      ${gone.length ? `<p class="warn">⚠️ ${gone.length} ${gone.length === 1 ? "puerta ya no existe" : "puertas ya no existen"} con la configuración actual y se quitarán al guardar.</p>` : ""}
      ${houses ? housesEditor() : buildingsEditor()}
    </section>

    <section class="card">
      <h2>Peques inscritos</h2>
      <p>Cada familia gestiona su inscripción. Borra aquí solo lo que no deba estar (alias inapropiados, duplicados...).</p>
      ${kidsList()}
    </section>

    <div class="savebar ${dirty || status ? "show" : ""}" role="status">${bar()}</div>`;
  scrollTo(0, y);
}

// ---------- Acciones ----------

async function enter(k) {
  root.innerHTML = `<p class="loading">Cargando…</p>`;
  try {
    await connect();
    await api("adminCheck", { key: k });
    key = k;
    try { sessionStorage.setItem(SESSION, k); } catch {}
    const [pub, adm] = await Promise.all([api("public"), api("adminKids", { key })]);
    applySettings(pub.settings);
    doors = pub.doors.map((d) => ({ ...d, tags: d.tags || [] }));
    kids = adm.kids;
    panel();
  } catch (e) {
    try { sessionStorage.removeItem(SESSION); } catch {}
    login(errorText(e));
  }
}

function touch(rebuild = true) {
  dirty = true;
  status = "";
  if (rebuild) panel();
  else updateBar();
}

async function save() {
  status = "Guardando…";
  updateBar();
  try {
    const clean = cleanSettings(settings());
    applySettings(clean);
    doors = doors.filter((d) => layout().fits(d));
    await api("adminSave", { key, settings: clean, doors });
    dirty = false;
    status = "Guardado ✓ Ya se ve en la web.";
  } catch (e) {
    status = errorText(e);
  }
  panel();
  setTimeout(() => { if (!dirty) { status = ""; updateBar(); } }, 3000);
}

// Escribe un ajuste en config: "buildings.portals.2.street" → config.buildings.portals[2].street
function setPath(path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  const target = parts.reduce((o, p) => o[p], config);
  target[last] = value;
}

function onSetting(input, rebuild) {
  const path = input.dataset.set;
  let value = input.type === "checkbox" ? input.checked : input.value;
  if (path === "buildings.portals") {
    // Ajusta la lista de portales al número pedido, conservando sus calles.
    const n = Math.min(LIMITS.portals, Math.max(1, parseInt(value, 10) || 1));
    const list = config.buildings.portals.slice(0, n);
    while (list.length < n) list.push({ street: "" });
    value = list;
  }
  setPath(path, value);
  if (rebuild) config.buildings = cleanSettings(settings()).buildings; // normaliza letras, límites...
  touch(rebuild);
}

root.addEventListener("input", (e) => {
  const input = e.target;
  if (input.dataset.set !== undefined && input.dataset.rebuild === undefined) onSetting(input, false);
});

root.addEventListener("change", (e) => {
  const input = e.target;
  if (input.dataset.set !== undefined && input.dataset.rebuild !== undefined) return onSetting(input, true);

  if (input.dataset.date !== undefined) {
    const [day = "", time = ""] = (config.date || "").split("T");
    const next = { day, time, [input.dataset.date]: input.value };
    config.date = next.day ? `${next.day}T${next.time || "00:00"}` : "";
    return touch(false);
  }

  if (input.name === "layout") {
    const other = doors.filter((d) => layout().fits(d)).length;
    if (other && !confirm(`Al cambiar el tipo se quitarán las ${other} puertas apuntadas al guardar. ¿Seguir?`)) return panel();
    config.layout = input.value;
    selected = null;
    return touch();
  }

  // Renombrar una calle: sus casas se mueven con ella.
  if (input.dataset.street !== undefined) {
    const i = Number(input.dataset.street);
    const before = config.houses.streets[i];
    const after = input.value.trim();
    if (!after || config.houses.streets.includes(after)) return panel();
    config.houses.streets[i] = after;
    doors.filter((d) => d.street === before).forEach((d) => { d.street = after; d.id = layout().idOf(after, d.number); });
    return touch();
  }

  const box = e.target.closest("[data-tag]");
  if (box) {
    const door = byId()[box.dataset.tag];
    door.tags = box.checked ? [...new Set([...door.tags, box.value])] : door.tags.filter((t) => t !== box.value);
    return touch();
  }
});

root.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  if (e.target.id === "login") return enter(f.get("key"));
  if (e.target.id === "add-street") {
    const street = f.get("street").trim();
    if (!street || config.houses.streets.includes(street)) return;
    if (config.houses.streets.length >= LIMITS.streets) return;
    config.houses.streets.push(street);
    touch();
    return root.querySelector("#add-street [name=street]").focus();
  }
  if (e.target.id === "add-house") {
    const street = (f.get("street") || "").trim();
    const number = f.get("number").trim();
    if (!number) return;
    const id = layout().idOf(street, number);
    if (doors.some((d) => d.id === id)) { status = `${layout().name({ street, number })} ya está en la lista.`; return updateBar(); }
    doors.push({ id, street, number, tags: f.getAll("tags") });
    touch();
    const form = root.querySelector("#add-house");
    if (form.street) form.street.value = street; // sigue en la misma calle
    form.number.focus();
  }
});

root.addEventListener("click", async (e) => {
  const win = e.target.closest("[data-door]");
  if (win) {
    const id = win.dataset.door;
    if (byId()[id]) { selected = selected === id ? null : id; return panel(); }
    doors.push({ id, street: "", number: "", tags: [] });
    selected = id;
    return touch();
  }

  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const { act, id } = btn.dataset;
  if (act === "save") return save();
  if (act === "copy-link") {
    try { await navigator.clipboard.writeText(shareLink()); btn.textContent = "Copiado ✓"; }
    catch { prompt("Enlace de tu web", shareLink()); }
    return;
  }
  if (act === "new-edition") {
    if (dirty) { status = "Guarda o descarta antes los cambios pendientes."; return updateBar(); }
    if (!confirm("Se borrarán todas las puertas y todas las inscripciones de peques. La configuración se conserva. ¿Seguir?")) return;
    try {
      await api("adminNewEdition", { key });
      doors = [];
      kids = [];
      selected = null;
      status = "Nueva edición lista ✓";
    } catch (e) {
      status = errorText(e);
    }
    panel();
    return;
  }
  if (act === "close") { selected = null; return panel(); }
  if (act === "remove") { doors = doors.filter((d) => d.id !== id); selected = null; return touch(); }
  if (act === "street-remove") {
    const street = config.houses.streets[btn.dataset.i];
    const n = doors.filter((d) => d.street === street).length;
    if (n && !confirm(`"${street}" tiene ${n} ${n === 1 ? "casa" : "casas"}. ¿Quitar la calle y sus casas?`)) return;
    config.houses.streets.splice(btn.dataset.i, 1);
    doors = doors.filter((d) => d.street !== street);
    return touch();
  }
  if (act === "logout") {
    if (dirty && !confirm("Hay cambios sin guardar. ¿Salir igualmente?")) return;
    try { sessionStorage.removeItem(SESSION); } catch {}
    key = ""; dirty = false;
    return login();
  }
  if (act === "kid-delete") {
    const kid = kids.find((k) => k.id === id);
    if (!confirm(`¿Borrar la inscripción de "${kid.alias}"?`)) return;
    try {
      await api("adminKidDelete", { key, id });
      kids = kids.filter((k) => k.id !== id);
    } catch (e) {
      status = errorText(e);
    }
    panel();
  }
});

// Recuerda si "Configuración" está abierta para no cerrarla al repintar.
root.addEventListener("toggle", (e) => {
  if (e.target.matches?.("details.settings")) settingsOpen = e.target.open;
}, true);

addEventListener("beforeunload", (e) => { if (dirty) e.preventDefault(); });

connect().then(() => (key ? enter(key) : login()));
