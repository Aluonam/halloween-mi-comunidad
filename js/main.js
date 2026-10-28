import { config } from "./config.js";
import { connect, loadCached, loadPublic, site } from "./api.js";
import { getLang, setLang, t } from "./i18n.js";
import * as fx from "./fx.js";
import * as hero from "./sections/hero.js";
import * as route from "./sections/route.js";
import * as party from "./sections/party.js";
import * as kids from "./sections/kids.js";
import * as rules from "./sections/rules.js";
import * as contact from "./sections/contact.js";

// Orden de las secciones. Añadir/quitar/reordenar = tocar esta lista. Sin lugar de minifiesta, no sale.
const all = [hero, route, party, kids, rules, contact];
const sections = () => all.filter((s) => s !== party || config.partyPlace);

const app = document.getElementById("app");
const langBtn = document.getElementById("lang");
let loadFailed = false;
let ready = false;

function banner() {
  if (site.demo) return `<p class="banner">${t("demoBanner", { admin: `admin.html${location.search}` })}</p>`;
  return loadFailed ? `<p class="banner">${t("loadError")}</p>` : "";
}

function render() {
  langBtn.textContent = t("switchTo");
  document.title = `Halloween 🎃 ${config.community}`;
  // Sin ajustes todavía (primera visita): espera a la hoja en lugar de enseñar valores de ejemplo.
  if (!ready) { app.innerHTML = `<p class="loading">🎃</p>`; return; }
  app.innerHTML = banner() + sections().map((s) => s.render()).join("");
  sections().forEach((s) => s.mount?.());
}

langBtn.addEventListener("click", () => {
  setLang(getLang() === "es" ? "en" : "es");
  render();
});

setLang(getLang());
fx.init();
ready = loadCached();
render();

// Lee comunidad.json y los datos de la hoja (ajustes, puertas y peques); cuando llegan, se repinta todo.
async function start() {
  await connect();
  await Promise.all([
    loadPublic().catch((e) => { loadFailed = true; console.warn("No se pudo leer la hoja", e); }),
    ...all.map((s) => s.load?.()),
  ]);
  ready = true;
  render();
}
start();
