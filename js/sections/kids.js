import { api, data, loadPublic, site } from "../api.js";
import { candy } from "../fx.js";
import { t } from "../i18n.js";
import { avatars, fallback } from "../data/avatars.js";
import { esc } from "./ui.js";

// Inscripción de peques: cada familia se apunta desde la web y recibe un enlace privado
// (#peque=id.clave) para cambiar o borrar su inscripción. Este dispositivo recuerda las suyas.
const MINE = () => `halloween-mine${site.demo ? "-demo" : ""}`;

let editing = null; // { id, token, alias, age, allergy } mientras se edita una inscripción propia
let notice = "";    // mensaje tras enviar (HTML)
let busy = false;

function mine() {
  try { return JSON.parse(localStorage.getItem(MINE())) || []; } catch { return []; }
}
function setMine(list) {
  try { localStorage.setItem(MINE(), JSON.stringify(list)); } catch {}
}

const linkOf = ({ id, token }) => `${location.origin}${location.pathname}${location.search}#peque=${id}.${token}`;

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

function form() {
  const k = editing || {};
  return `
    <form class="kid-form">
      <h3>${editing ? t("editingKid", { alias: esc(k.alias) }) : t("kidsFormTitle")}</h3>
      <label>${t("fAlias")}<input name="alias" required maxlength="40" value="${esc(k.alias || "")}" placeholder="${t("fAliasHint")}" autocomplete="off"></label>
      <div class="pair">
        <label>${t("fAge")}<input name="age" maxlength="20" value="${esc(k.age || "")}" placeholder="6" inputmode="numeric" autocomplete="off"></label>
        <label>${t("fAllergy")}<input name="allergy" maxlength="80" value="${esc(k.allergy || "")}" placeholder="${t("fAllergyHint")}" autocomplete="off"></label>
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
          <button type="button" class="btn alt" data-kid="edit" data-id="${esc(k.id)}">${t("edit")}</button>
          <button type="button" class="btn alt" data-kid="copy" data-id="${esc(k.id)}">${t("copyLink")}</button>
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

// Abre una inscripción desde el enlace privado (#peque=id.clave).
async function openLink() {
  const m = location.hash.match(/^#peque=([\w-]+)\.([\w-]+)$/);
  if (!m) return;
  const [, id, token] = m;
  history.replaceState(null, "", location.pathname + location.search);
  try {
    editing = { id, token, ...(await api("kidGet", { id, token })) };
    remember(editing);
    notice = "";
  } catch (e) {
    notice = `<p>${errorText(e)}</p>`;
  }
}

function remember({ id, token, alias }) {
  setMine([...mine().filter((k) => k.id !== id), { id, token, alias }]);
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
    const f = new FormData(e.target);
    const kid = { alias: f.get("alias").trim(), age: f.get("age").trim(), allergy: f.get("allergy").trim() };
    if (!kid.alias) return;
    run(async () => {
      if (editing) {
        await api("kidUpdate", { id: editing.id, token: editing.token, ...kid });
        remember({ ...editing, ...kid });
        editing = null;
        notice = `<p>${t("savedKid")}</p>`;
      } else {
        const { id, token } = await api("kidCreate", kid);
        remember({ id, token, alias: kid.alias });
        const link = esc(linkOf({ id, token }));
        notice = `<p>${t("createdKid")}</p><p class="link"><a href="${link}">${link}</a></p>
          <button type="button" class="btn alt" data-kid="copy" data-id="${esc(id)}">${t("copyLink")}</button>`;
        const r = e.target.getBoundingClientRect();
        candy(r.left + r.width / 2, r.top);
      }
    });
  });

  el.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-kid]");
    if (!btn || busy) return;
    const own = mine().find((k) => k.id === btn.dataset.id);
    const act = btn.dataset.kid;

    if (act === "copy" && own) {
      try { await navigator.clipboard.writeText(linkOf(own)); btn.textContent = t("copied"); }
      catch { prompt(t("copyLink"), linkOf(own)); }
    }
    if (act === "cancel") { editing = null; notice = ""; refresh(); }
    if (act === "edit" && own) {
      run(async () => {
        try {
          editing = { ...own, ...(await api("kidGet", own)) };
          notice = "";
        } catch (err) {
          // Ya no existe (la borró el gestor): deja de mostrarla.
          if (err.code === "notfound") setMine(mine().filter((k) => k.id !== own.id));
          throw err;
        }
      });
    }
    if (act === "delete" && editing && confirm(t("confirmDelete"))) {
      const { id, token } = editing;
      run(async () => {
        await api("kidDelete", { id, token });
        setMine(mine().filter((k) => k.id !== id));
        editing = null;
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
