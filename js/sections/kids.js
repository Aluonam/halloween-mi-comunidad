import { api, data, loadPublic, site } from "../api.js";
import { config } from "../config.js";
import { candy } from "../fx.js";
import { t } from "../i18n.js";
import { avatars, fallback } from "../data/avatars.js";
import { LIMITS } from "../settings.js";
import { esc } from "./ui.js";

// Inscripción de peques: cada familia apunta a uno o varios peques de una vez y recibe un enlace privado
// (#peque=clave) para cambiarlos, añadir más o borrarlos. En la web cada peque sale por separado.
// Este dispositivo recuerda sus inscripciones.
const MINE = () => `halloween-mine${site.demo ? "-demo" : ""}`;

let editing = null; // { token, kids: [{ id, alias, age, allergy }] } mientras se edita una inscripción propia
let draft = [{}];   // filas del formulario (con id = peque ya inscrito)
let notice = "";    // mensaje tras enviar (HTML)
let busy = false;

// Inscripciones guardadas: [{ token, alias }]. Las antiguas, de un solo peque, también traen id.
function mine() {
  try { return JSON.parse(localStorage.getItem(MINE())) || []; } catch { return []; }
}
function setMine(list) {
  try { localStorage.setItem(MINE(), JSON.stringify(list)); } catch {}
}

const linkOf = ({ token }) => `${location.origin}${location.pathname}${location.search}#peque=${token}`;
const names = (kids) => kids.map((k) => k.alias).join(", ");

// Respuestas que significan "sin alergias".
const NONE = /^(|no|ninguna?|nada|none|nope|-+|n\/?a)\.?$/i;

// "La Bruja Lucía" → " la bruja lucia": sin tildes ni mayúsculas, con un espacio delante de cada palabra.
const words = (text) => " " + text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Emoji que encaja con el alias (js/data/avatars.js); si no hay ninguno, uno de reserva.
function avatar(alias, i) {
  const text = words(alias);
  const hit = avatars.find(([keys]) => keys.some((k) => text.includes(words(k))));
  return hit ? hit[1] : fallback[i % fallback.length];
}

// "2 - 4 años" se muestra tal cual; "7 - 10" → "7 - 10 años"
const age = (text) => (/[a-zá-ú]/i.test(text) ? esc(text) : t("age", { n: esc(text) }));

// Alergias que han escrito los padres, agrupadas: [["piña", 2], ...]
function allergyList() {
  const groups = {};
  data.kids.filter((k) => !NONE.test(k.allergy.trim())).forEach((k) => {
    const key = k.allergy.trim().toLowerCase();
    groups[key] = groups[key] || [k.allergy.trim(), 0];
    groups[key][1]++;
  });
  return Object.values(groups);
}

const allergyChips = (list) =>
  `<ul class="allergies">${list.map(([text, n]) => `<li>${esc(text)}${n > 1 ? ` × ${n}` : ""}</li>`).join("")}</ul>`;

function card(k, i) {
  return `
    <li class="kid">
      <span class="avatar" style="--d:-${i * 0.7}s">${avatar(k.alias, i)}</span>
      <b>${esc(k.alias)}</b>
      ${k.age ? `<small>${age(k.age)}</small>` : ""}
    </li>`;
}

// Plazas libres y peques nuevos que aún caben en el formulario.
const room = () => Math.max(0, config.kidsMax - data.kids.length);
const canAdd = () => draft.length < LIMITS.family && draft.filter((k) => !k.id).length < room();

function row(k, i) {
  return `
    <fieldset class="kid-row">
      <legend>${t("kidN", { n: i + 1 })}</legend>
      <input type="hidden" name="id" value="${esc(k.id || "")}">
      <label>${t("fAlias")}<input name="alias" required maxlength="40" value="${esc(k.alias || "")}" placeholder="${t("fAliasHint")}" autocomplete="off"></label>
      <div class="pair">
        <label>${t("fAge")}<input name="age" maxlength="20" value="${esc(k.age || "")}" placeholder="6" inputmode="numeric" autocomplete="off"></label>
        <label>${t("fAllergy")}<input name="allergy" maxlength="80" value="${esc(k.allergy || "")}" placeholder="${t("fAllergyHint")}" autocomplete="off"></label>
      </div>
      ${draft.length > 1 ? `<button type="button" class="btn alt small" data-kid="drop" data-i="${i}">${t("removeKid")}</button>` : ""}
    </fieldset>`;
}

// Inscripción cerrada: no quedan plazas (se puede seguir editando la propia).
function closed() {
  const wa = config.whatsapp ? ` <a href="${esc(config.whatsapp)}" target="_blank" rel="noopener">${t("askManager")}</a>` : "";
  return `<div class="kid-form closed"><p>${t("kidsFull", { n: config.kidsMax })}${wa}</p></div>`;
}

function form() {
  if (!editing && !room()) return closed();
  const left = room();
  return `
    <form class="kid-form">
      <h3>${editing ? t("editingKid", { alias: esc(names(editing.kids)) }) : t("kidsFormTitle")}</h3>
      ${draft.map(row).join("")}
      ${canAdd() ? `<button type="button" class="btn alt small add-kid" data-kid="add">${t("addKid")}</button>` : ""}
      ${left <= 10 ? `<p class="spots">${t(left === 1 ? "spotsOne" : "spots", { n: left })}</p>` : ""}
      <div class="public-note">
        <p>${t("publicNote")}</p>
        ${editing ? "" : `<label class="check"><input type="checkbox" name="ok" required> ${t("publicOk")}</label>`}
      </div>
      <p class="privacy">${t("fPrivacy")}</p>
      <button class="btn" ${busy ? "disabled" : ""}>${busy ? t("sending") : editing ? t("fSave") : t("fSubmit")}</button>
      ${editing ? `
        <button type="button" class="btn alt" data-kid="cancel">${t("fCancel")}</button>
        <button type="button" class="btn danger" data-kid="delete">${t("fDelete")}</button>` : ""}
    </form>`;
}

function myList() {
  const list = mine();
  if (!list.length) return "";
  return `
    <div class="mine">
      <p>${t("mine")}</p>
      <ul>${list.map((k) => `
        <li><b>${esc(k.alias)}</b>
          <button type="button" class="btn alt" data-kid="edit" data-token="${esc(k.token)}">${t("edit")}</button>
          <button type="button" class="btn alt" data-kid="copy" data-token="${esc(k.token)}">${t("copyLink")}</button>
        </li>`).join("")}</ul>
    </div>`;
}

function inner() {
  const { kids } = data;
  const allergies = allergyList();
  return `
    <h2>${t("kidsTitle")}</h2>
    <p>${t("kidsIntro")}</p>
    ${kids.length ? `<p class="count">${t(kids.length === 1 ? "kidsCountOne" : "kidsCount", { n: kids.length })}</p>` : ""}
    ${allergies.length ? `
      <p>${t("kidsAllergies")}</p>
      ${allergyChips(allergies)}` : ""}
    ${kids.length ? `<ul class="kids">${kids.map(card).join("")}</ul>` : ""}
    ${notice ? `<div class="notice" role="status">${notice}</div>` : ""}
    ${form()}
    ${myList()}`;
}

export const render = () => `<section id="kids" class="card reveal">${inner()}</section>`;

const errorText = (e) => t("errors")[e.code] || t("errors").network;

// Lo escrito en el formulario, fila a fila.
function readForm(f) {
  const d = new FormData(f);
  const [ids, aliases, ages, allergies] = ["id", "alias", "age", "allergy"].map((k) => d.getAll(k).map((v) => String(v).trim()));
  return aliases.map((alias, i) => ({ id: ids[i], alias, age: ages[i], allergy: allergies[i] }));
}

function startEditing(token, kids) {
  editing = { token, kids };
  draft = kids.map((k) => ({ ...k }));
  remember(editing);
}

function stopEditing() {
  editing = null;
  draft = [{}];
}

// Abre una inscripción desde el enlace privado (#peque=clave; los antiguos son #peque=id.clave).
async function openLink() {
  const m = location.hash.match(/^#peque=(?:[\w-]+\.)?([\w-]+)$/);
  if (!m) return;
  const token = m[1];
  history.replaceState(null, "", location.pathname + location.search);
  try {
    startEditing(token, (await api("familyGet", { token })).kids);
    notice = "";
  } catch (e) {
    notice = `<p>${errorText(e)}</p>`;
  }
}

function remember({ token, kids }) {
  const rest = mine().filter((k) => k.token !== token);
  setMine(kids.length ? [...rest, { token, alias: names(kids) }] : rest);
}

export async function load() {
  await openLink();
}

export function mount() {
  const el = document.getElementById("kids");
  const refresh = () => { el.innerHTML = inner(); };
  const show = () => el.querySelector(".notice, .kid-form")?.scrollIntoView({ block: "center" });

  async function run(task) {
    busy = true;
    refresh();
    try {
      await task();
      await loadPublic().catch(() => {});
    } catch (e) {
      notice = `<p>${errorText(e)}</p>`;
    }
    busy = false;
    refresh();
    show();
  }

  el.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) return;
    draft = readForm(e.target);
    const kids = draft.filter((k) => k.alias);
    if (!kids.length) return;
    run(async () => {
      if (editing) {
        const out = await api("familySave", { token: editing.token, kids });
        remember(out);
        stopEditing();
        notice = `<p>${t("savedKid")}</p>`;
      } else {
        const out = await api("familySave", { kids });
        remember(out);
        draft = [{}];
        const link = esc(linkOf(out));
        notice = `<p>${t(kids.length === 1 ? "createdKid" : "createdKids", { n: kids.length })}</p><p class="link"><a href="${link}">${link}</a></p>
          <button type="button" class="btn alt" data-kid="copy" data-token="${esc(out.token)}">${t("copyLink")}</button>`;
        const r = e.target.getBoundingClientRect();
        candy(r.left + r.width / 2, r.top);
      }
    });
  });

  el.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-kid]");
    if (!btn || busy) return;
    const own = mine().find((k) => k.token === btn.dataset.token);
    const act = btn.dataset.kid;
    const f = el.querySelector("form.kid-form");

    if (act === "add" && f) {
      draft = [...readForm(f), {}];
      refresh();
      el.querySelectorAll(".kid-row")[draft.length - 1]?.querySelector("[name=alias]").focus();
    }
    if (act === "drop" && f) {
      draft = readForm(f).filter((_, i) => i !== Number(btn.dataset.i));
      refresh();
    }
    if (act === "copy" && own) {
      try { await navigator.clipboard.writeText(linkOf(own)); btn.textContent = t("copied"); }
      catch { prompt(t("copyLink"), linkOf(own)); }
    }
    if (act === "cancel") { stopEditing(); notice = ""; refresh(); }
    if (act === "edit" && own) {
      run(async () => {
        try {
          startEditing(own.token, (await api("familyGet", { token: own.token })).kids);
          notice = "";
        } catch (err) {
          // Ya no existe (la borró el gestor): deja de mostrarla.
          if (err.code === "notfound") setMine(mine().filter((k) => k.token !== own.token));
          throw err;
        }
      });
    }
    if (act === "delete" && editing && confirm(t("confirmDelete"))) {
      const { token } = editing;
      run(async () => {
        await api("familySave", { token, kids: [] });
        remember({ token, kids: [] });
        stopEditing();
        notice = `<p>${t("deletedKid")}</p>`;
      });
    }
  });

  // Enlace privado abierto con la web ya cargada. (mount se repite al cambiar de idioma: un solo oyente.)
  onHash = async () => {
    await openLink();
    refresh();
    show();
  };
  if (!listening) addEventListener("hashchange", () => onHash());
  listening = true;
  if (editing) show();
}

let onHash, listening = false;
