/* ============================================================
   STATIC CONFIG — PF2e (Remaster) structure the engine consumes.
   Game-math mappings (skill→ability, save→ability, exploration
   activity→governing skill) are hand-authored here; prose comes from
   the Foundry-derived data/reference.generated.js at build time.
   ============================================================ */

/* The six ability scores, in canonical order. */
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_LABEL = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };

/* The 16 trained skills and their key ability (Pathbuilder uses these exact keys
   in build.proficiencies). */
const SKILLS = [
  { key: "acrobatics", label: "Acrobatics", ability: "dex" },
  { key: "arcana", label: "Arcana", ability: "int" },
  { key: "athletics", label: "Athletics", ability: "str" },
  { key: "crafting", label: "Crafting", ability: "int" },
  { key: "deception", label: "Deception", ability: "cha" },
  { key: "diplomacy", label: "Diplomacy", ability: "cha" },
  { key: "intimidation", label: "Intimidation", ability: "cha" },
  { key: "medicine", label: "Medicine", ability: "wis" },
  { key: "nature", label: "Nature", ability: "wis" },
  { key: "occultism", label: "Occultism", ability: "int" },
  { key: "performance", label: "Performance", ability: "cha" },
  { key: "religion", label: "Religion", ability: "wis" },
  { key: "society", label: "Society", ability: "int" },
  { key: "stealth", label: "Stealth", ability: "dex" },
  { key: "survival", label: "Survival", ability: "wis" },
  { key: "thievery", label: "Thievery", ability: "dex" },
];
const SKILL_ABILITY = {};
SKILLS.forEach((s) => { SKILL_ABILITY[s.key] = s.ability; });

/* The three saving throws. */
const SAVES = [
  { key: "fortitude", label: "Fort", full: "Fortitude", ability: "con" },
  { key: "reflex", label: "Ref", full: "Reflex", ability: "dex" },
  { key: "will", label: "Will", full: "Will", ability: "wis" },
];

const PERCEPTION = { ability: "wis" };

/* Proficiency rank-value (0/2/4/6/8) → readable label. */
const RANK_LABEL = { 0: "Untrained", 2: "Trained", 4: "Expert", 6: "Master", 8: "Legendary" };
const RANK_ABBR = { 0: "U", 2: "T", 4: "E", 6: "M", 8: "L" };

/* Special senses to detect inside a Pathbuilder build's `specials` array
   (matched case-insensitively). */
const SENSES = [
  "Low-Light Vision", "Darkvision", "Greater Darkvision", "Scent", "Tremorsense",
  "Lifesense", "Echolocation", "Wavesense", "Truesight", "See the Unseen",
];

/* The exploration activities (GM Core). `governing` is the skill/statistic a GM
   most often references for the activity — a skill key, "perception", "varies"
   (depends on what's being done), or "none" (no roll). `actionSlug` links to the
   full rules text in the generated reference data. */
const EXPLORATION_ACTIVITIES = [
  { key: "avoid-notice", label: "Avoid Notice", governing: "stealth", actionSlug: "avoid-notice",
    short: "Use Stealth to avoid being noticed while traveling." },
  { key: "cover-tracks", label: "Cover Tracks", governing: "survival", actionSlug: "cover-tracks",
    short: "Use Survival to obscure the party's trail." },
  { key: "defend", label: "Defend", governing: "none", actionSlug: "defend",
    short: "Travel at half Speed with your shield raised, ready for danger." },
  { key: "detect-magic", label: "Detect Magic", governing: "none", actionSlug: "detect-magic",
    short: "Cast detect magic at intervals as you travel." },
  { key: "follow-the-expert", label: "Follow the Expert", governing: "varies", actionSlug: "follow-the-expert",
    short: "Match an ally's activity, adding their proficiency to your check." },
  { key: "hustle", label: "Hustle", governing: "none", actionSlug: "hustle",
    short: "Move at double travel Speed for a time based on your Constitution." },
  { key: "investigate", label: "Investigate", governing: "varies", actionSlug: "investigate",
    short: "Recall Knowledge as you travel (the relevant knowledge skill)." },
  { key: "repeat-a-spell", label: "Repeat a Spell", governing: "none", actionSlug: "repeat-a-spell",
    short: "Sustain a spell repeatedly as you travel." },
  { key: "scout", label: "Scout", governing: "none", actionSlug: "scout",
    short: "Scout ahead, granting the party a bonus to initiative." },
  { key: "search", label: "Search", governing: "perception", actionSlug: "search",
    short: "Use Perception to look for hidden creatures, doors, and hazards." },
  { key: "track", label: "Track", governing: "survival", actionSlug: "track",
    short: "Use Survival to follow tracks as you travel." },
];
const EXPLORATION_BY_KEY = {};
EXPLORATION_ACTIVITIES.forEach((a) => { EXPLORATION_BY_KEY[a.key] = a; });

/* Conditions surfaced as quick-add buttons in live tracking. `valued` conditions
   carry a numeric value (Frightened 2). Wounded/Dying/Doomed have dedicated
   steppers and are intentionally not listed here. */
const QUICK_CONDITIONS = [
  { key: "frightened", label: "Frightened", valued: true },
  { key: "sickened", label: "Sickened", valued: true },
  { key: "clumsy", label: "Clumsy", valued: true },
  { key: "enfeebled", label: "Enfeebled", valued: true },
  { key: "drained", label: "Drained", valued: true },
  { key: "stupefied", label: "Stupefied", valued: true },
  { key: "slowed", label: "Slowed", valued: true },
  { key: "stunned", label: "Stunned", valued: true },
  { key: "off-guard", label: "Off-Guard", valued: false },
  { key: "prone", label: "Prone", valued: false },
  { key: "fatigued", label: "Fatigued", valued: false },
  { key: "blinded", label: "Blinded", valued: false },
  { key: "dazzled", label: "Dazzled", valued: false },
  { key: "deafened", label: "Deafened", valued: false },
  { key: "grabbed", label: "Grabbed", valued: false },
  { key: "restrained", label: "Restrained", valued: false },
  { key: "unconscious", label: "Unconscious", valued: false },
];

/* ============================================================
   INLINE SVG ICON REGISTRY
   Thin line icons (24x24, stroke = currentColor) so they inherit the
   active accent. Keyed by name; iconSvg() wraps the path in an <svg>.
   ============================================================ */
const ICONS = {
  /* navigation */
  roster: '<path d="M3 5h18M3 12h18M3 19h18"/><circle cx="6.5" cy="5" r="1.3"/><circle cx="6.5" cy="12" r="1.3"/><circle cx="6.5" cy="19" r="1.3"/>',
  roll: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none"/>',
  explore: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13 13l-4.5 2.5L11 11z"/>',
  reference: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 1 6.5 18H19v3H6.5A1.5 1.5 0 0 1 5 19.5z"/>',
  menu: '<circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
  /* stats */
  shield: '<path d="M12 3 5 5.5v5.5c0 4 2.9 7 7 8.5 4.1-1.5 7-4.5 7-8.5V5.5z"/>',
  eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.4"/>',
  heart: '<path d="M12 20s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.5C19 15.6 12 20 12 20z"/>',
  star: '<path d="M12 3.5l2.5 5.3 5.5.7-4 4 1 5.6L12 16.5 6.9 19l1-5.6-4-4 5.5-.7z"/>',
  boot: '<path d="M7 3v10l-2 2v4h13v-2c0-2-2-2.5-2-4V9"/><path d="M7 13h5"/>',
  /* utility */
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  install: '<path d="M12 3v11M8 10l4 4 4-4"/><path d="M5 20h14"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
};
function iconSvg(name, cls) {
  const p = ICONS[name] || "";
  return `<svg class="icn${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
