// Datos de ejemplo para el modo demostración (sin comunidad.json).
const kids = [
  { alias: "Bruja Piruja", age: "6", allergy: "" },
  { alias: "Vampirito", age: "4", allergy: "frutos secos" },
  { alias: "Calabacín Zombi", age: "8", allergy: "" },
];

const common = {
  community: "Residencial Los Fantasmas",
  date: "2026-10-31T18:30",
  routeEnd: "20:30",
  partyPlace: "Sala común",
  partyStart: "20:30",
  partyEnd: "21:30",
  whatsapp: "",
  volunteersForm: "",
};

export const demoData = {
  buildings: {
    settings: {
      ...common,
      layout: "buildings",
      buildings: {
        portals: [{ street: "Calle del Olmo 1" }, { street: "Calle del Olmo 3" }, { street: "Calle del Roble 2" }, { street: "Calle del Roble 4" }],
        floors: 7, ground: true, letters: "ABCDEFGHI",
      },
      houses: { streets: [] },
    },
    doors: [
      { id: "1-0B", tags: [] },
      { id: "1-3A", tags: ["gluten"] },
      { id: "2-2C", tags: [] },
      { id: "2-5F", tags: ["nuts"] },
      { id: "3-0I", tags: [] },
      { id: "3-4D", tags: [] },
      { id: "4-1B", tags: ["gluten", "nuts"] },
    ],
    kids,
  },
  houses: {
    settings: {
      ...common,
      community: "Urbanización El Sauce Llorón",
      layout: "houses",
      buildings: { portals: [{ street: "" }], floors: 0, ground: true, letters: "A" },
      houses: { streets: ["Calle del Olmo", "Calle del Roble"] },
    },
    doors: [
      { id: "calle-del-olmo-3", street: "Calle del Olmo", number: "3", tags: [] },
      { id: "calle-del-olmo-8", street: "Calle del Olmo", number: "8", tags: ["gluten"] },
      { id: "calle-del-olmo-15", street: "Calle del Olmo", number: "15", tags: [] },
      { id: "calle-del-roble-4", street: "Calle del Roble", number: "4", tags: ["nuts"] },
      { id: "calle-del-roble-12b", street: "Calle del Roble", number: "12B", tags: [] },
    ],
    kids,
  },
};
