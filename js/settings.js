// Limpia los ajustes del gestor antes de guardarlos. Misma lógica que cleanSettings en apps-script/Code.gs.
export const LIMITS = { portals: 30, floors: 40, letters: 12, streets: 50, kids: 500, kidsMax: 100, family: 10 };

export const text = (v, max) => String(v ?? "").trim().replace(/^[=+\-@]+/, "").slice(0, max);
const time = (v) => (/^\d{2}:\d{2}$/.test(v) ? v : "");
const link = (v) => (/^https:\/\/\S+$/.test(v) ? String(v).slice(0, 500) : "");
const int = (v, min, max, fallback) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
};
const unique = (list) => [...new Set(list)];

export function cleanSettings(s = {}) {
  const b = s.buildings || {};
  const portals = (Array.isArray(b.portals) ? b.portals : []).slice(0, LIMITS.portals).map((p) => ({ street: text(p?.street, 60) }));
  const letters = unique(String(b.letters || "").toUpperCase().replace(/[^A-Z]/g, "")).slice(0, LIMITS.letters).join("");
  const streets = unique((s.houses?.streets || []).map((x) => text(x, 60)).filter(Boolean)).slice(0, LIMITS.streets);
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
      floors: int(b.floors, 0, LIMITS.floors, 0),
      ground: !!b.ground,
      letters: letters || "A",
    },
    houses: { streets },
    kidsMax: int(s.kidsMax, 1, LIMITS.kids, LIMITS.kidsMax),
  };
}
