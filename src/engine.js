/* ============================================================
   ENGINE — PF2e party tracker for GMs
   Character stats are derived from imported Pathbuilder builds.
   Reference prose: GENERATED_CONDITIONS / GENERATED_ACTIONS (Foundry pf2e, OGL/ORC).
   Static structure: config.js (SKILLS / SAVES / EXPLORATION_ACTIVITIES / …)
   ============================================================ */

/* ---- Reference data indices ---- */
const REF_META = (typeof GENERATED_REF_META !== "undefined") ? GENERATED_REF_META : {};
const CONDITIONS = (typeof GENERATED_CONDITIONS !== "undefined") ? GENERATED_CONDITIONS : [];
const ACTIONS = (typeof GENERATED_ACTIONS !== "undefined") ? GENERATED_ACTIONS : [];
const CONDITION_BY_SLUG = {}; CONDITIONS.forEach((c) => { CONDITION_BY_SLUG[c.slug] = c; });
const ACTION_BY_SLUG = {}; ACTIONS.forEach((a) => { ACTION_BY_SLUG[a.slug] = a; });

/* ============================================================
   STATE / PERSISTENCE
   One "library" object under one localStorage key.
   ============================================================ */
const LS_KEY = "pf2ePartyTracker.v1";

function uid() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function defaultSettings() { return { themeMode: "auto", custom: null }; }
function defaultBoard() { return { assignments: {}, marchOrder: [] }; }
function freshLive(hpMax) {
  return { hpCur: Number(hpMax) || 0, hpTemp: 0, heroPoints: 1, wounded: 0, dying: 0, doomed: 0, conditions: [] };
}

let library = loadLibrary();

function loadLibrary() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY));
    if (v && v.characters) return normalizeLib(v);
  } catch (e) { /* fall through */ }
  return normalizeLib({ characters: {}, order: [], activeId: null });
}
/* Back-fill every field the renderers assume. A stored character can come from
   an older version, a hand-edited localStorage, or a party code pasted from
   another GM — anything missing or of the wrong type is replaced so a partial
   record can never break a render. */
function normalizeCharacter(c) {
  c = (c && typeof c === "object") ? c : {};
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const arr = (v) => (Array.isArray(v) ? v : []);

  c.name = String(c.name == null || c.name === "" ? "Unnamed" : c.name);
  c.class = String(c.class || "");
  c.ancestry = String(c.ancestry || ""); c.heritage = String(c.heritage || ""); c.background = String(c.background || "");
  c.level = clamp(Math.round(num(c.level, 1)), 1, 30);
  c.keyability = ABILITIES.includes(c.keyability) ? c.keyability : "str";

  c.abilities = (c.abilities && typeof c.abilities === "object") ? c.abilities : {};
  c.mods = (c.mods && typeof c.mods === "object") ? c.mods : {};
  ABILITIES.forEach((a) => {
    c.abilities[a] = num(c.abilities[a], 10);
    c.mods[a] = num(c.mods[a], abilityMod(c.abilities[a]));
  });

  c.ac = num(c.ac, 0);
  c.perception = num(c.perception, c.mods.wis);
  c.perceptionPassive = num(c.perceptionPassive, 10 + c.perception);
  c.hpMax = Math.max(0, Math.round(num(c.hpMax, 0)));
  c.speed = num(c.speed, 0);
  c.classDC = num(c.classDC, 10);
  c.focusPool = Math.max(0, Math.round(num(c.focusPool, 0)));

  const saves = (c.saves && typeof c.saves === "object") ? c.saves : {};
  c.saves = {};
  SAVES.forEach((s) => { c.saves[s.key] = num(saves[s.key], c.mods[s.ability]); });

  const skills = (c.skills && typeof c.skills === "object") ? c.skills : {};
  c.skills = {};
  SKILLS.forEach((s) => {
    const src = (skills[s.key] && typeof skills[s.key] === "object") ? skills[s.key] : {};
    const mod = num(src.mod, c.mods[s.ability]);
    c.skills[s.key] = { rank: num(src.rank, 0), mod: mod, passive: num(src.passive, 10 + mod) };
  });

  c.lores = arr(c.lores).map((l) => {
    const src = (l && typeof l === "object") ? l : {};
    const mod = num(src.mod, c.mods.int);
    return { name: String(src.name || "Lore"), rank: num(src.rank, 0), mod: mod, passive: num(src.passive, 10 + mod) };
  });
  c.languages = arr(c.languages).map(String);
  c.senses = arr(c.senses).map(String);
  c.spellcasting = arr(c.spellcasting).map((sp) => {
    const src = (sp && typeof sp === "object") ? sp : {};
    return {
      name: String(src.name || "Spells"), tradition: String(src.tradition || ""), type: String(src.type || ""),
      ability: ABILITIES.includes(src.ability) ? src.ability : "cha",
      dc: num(src.dc, 10), attack: num(src.attack, 0), focusPoints: Math.max(0, Math.round(num(src.focusPoints, 0))),
    };
  });
  c.pbId = c.pbId == null ? null : String(c.pbId);

  const live = Object.assign(freshLive(c.hpMax), (c.live && typeof c.live === "object") ? c.live : {});
  live.hpTemp = Math.max(0, Math.round(num(live.hpTemp, 0)));
  live.heroPoints = clamp(Math.round(num(live.heroPoints, 1)), 0, 3);
  live.wounded = clamp(Math.round(num(live.wounded, 0)), 0, 3);
  live.doomed = clamp(Math.round(num(live.doomed, 0)), 0, 3);
  live.dying = clamp(Math.round(num(live.dying, 0)), 0, Math.max(1, 4 - live.doomed));
  live.conditions = arr(live.conditions)
    .filter((x) => x && typeof x === "object" && x.key)
    .map((x) => ({ key: String(x.key), value: x.value == null ? null : Math.max(1, Math.round(num(x.value, 1))) }))
    .filter((x, i, all) => all.findIndex((y) => y.key === x.key) === i);
  c.live = live;
  c.live.hpCur = clamp(Math.round(num(live.hpCur, effMaxHP(c))), 0, effMaxHP(c));
  return c;
}
function normalizeLib(lib) {
  lib = (lib && typeof lib === "object") ? lib : {};
  lib.characters = (lib.characters && typeof lib.characters === "object") ? lib.characters : {};
  const seen = {};
  lib.order = (Array.isArray(lib.order) ? lib.order : [])
    .filter((id) => lib.characters[id] && !seen[id] && (seen[id] = true));
  // back-fill order with any characters missing from it
  Object.keys(lib.characters).forEach((id) => { if (!lib.order.includes(id)) lib.order.push(id); });
  Object.keys(lib.characters).forEach((id) => {
    lib.characters[id] = normalizeCharacter(lib.characters[id]);
    lib.characters[id].id = id;
  });
  lib.board = Object.assign(defaultBoard(), (lib.board && typeof lib.board === "object") ? lib.board : {});
  lib.board.assignments = (lib.board.assignments && typeof lib.board.assignments === "object") ? lib.board.assignments : {};
  Object.keys(lib.board.assignments).forEach((id) => {
    if (!lib.characters[id] || !EXPLORATION_BY_KEY[lib.board.assignments[id]]) delete lib.board.assignments[id];
  });
  const seenM = {};
  lib.board.marchOrder = (Array.isArray(lib.board.marchOrder) ? lib.board.marchOrder : [])
    .filter((id) => lib.characters[id] && !seenM[id] && (seenM[id] = true));
  lib.settings = Object.assign(defaultSettings(), (lib.settings && typeof lib.settings === "object") ? lib.settings : {});
  if (!lib.characters[lib.activeId]) lib.activeId = null;
  return lib;
}
let _storageWarned = false;
function saveState() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(library)); }
  catch (e) { if (!_storageWarned && typeof toast === "function") { toast("Couldn't save — storage full or disabled"); _storageWarned = true; } }
}

/* Ordered list of PCs (respecting library.order). */
function pcs() { return library.order.map((id) => library.characters[id]).filter(Boolean); }
function pcById(id) { return library.characters[id] || null; }

/* ============================================================
   FORMATTING HELPERS
   ============================================================ */
function sign(n) { n = Number(n) || 0; return (n >= 0 ? "+" : "") + n; }
function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function textToHtml(s) { return escapeHtml(s).replace(/\n/g, "<br>"); }
function titleCase(s) { s = String(s || ""); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

/* ============================================================
   CONDITION EFFECTS
   Mirrors the FlatModifier rules in the Foundry pf2e condition data:
     frightened / sickened  status −value to every check and DC
     clumsy                 status −value to dex-based (AC, Reflex, Acrobatics/Stealth/Thievery)
     enfeebled              status −value to str-based
     stupefied              status −value to int/wis/cha-based (Perception, Will, spell DCs)
     drained                status −value to con-based, and −level × value maximum HP
     fatigued               status −1 to AC and saves
     off-guard / prone / grabbed / restrained
                            circumstance −2 to AC (the immobilizing conditions and prone
                            all make you off-guard; same-type penalties never stack)
     blinded                status −4 to Perception
     deafened               status −2 to Perception (Foundry scopes this to initiative and
                            auditory checks; the roller doubles as an initiative roller, so
                            it is applied and always named in the breakdown)
     unconscious            status −4 to AC / Perception / Reflex, and off-guard
   PF2e stacking: of several penalties of the same TYPE only the worst applies;
   penalties of different types add together.
   ============================================================ */
const CONDITION_EFFECTS = {
  frightened: [{ type: "status", scaled: true, domains: ["all"] }],
  sickened: [{ type: "status", scaled: true, domains: ["all"] }],
  clumsy: [{ type: "status", scaled: true, domains: ["dex-based"] }],
  enfeebled: [{ type: "status", scaled: true, domains: ["str-based"] }],
  stupefied: [{ type: "status", scaled: true, domains: ["int-based", "wis-based", "cha-based"] }],
  drained: [{ type: "status", scaled: true, domains: ["con-based"] }],
  fatigued: [{ type: "status", value: 1, domains: ["ac", "saving-throw"] }],
  "off-guard": [{ type: "circumstance", value: 2, domains: ["ac"] }],
  prone: [{ type: "circumstance", value: 2, domains: ["ac"] }],
  grabbed: [{ type: "circumstance", value: 2, domains: ["ac"] }],
  restrained: [{ type: "circumstance", value: 2, domains: ["ac"] }],
  blinded: [{ type: "status", value: 4, domains: ["perception"] }],
  deafened: [{ type: "status", value: 2, domains: ["perception"] }],
  unconscious: [
    { type: "status", value: 4, domains: ["ac", "perception", "reflex"] },
    { type: "circumstance", value: 2, domains: ["ac"] },
  ],
};

/* The modifier "domains" a statistic belongs to (Foundry's selectors). */
function statDomains(pc, key) {
  if (key === "ac") return ["all", "ac", "dex-based"];
  if (key === "perception") return ["all", "perception", "wis-based"];
  if (key === "classDC") return ["all", (pc && pc.keyability ? pc.keyability : "str") + "-based"];
  if (key === "lore") return ["all", "skill-check", "int-based"];
  const sv = SAVES.find((s) => s.key === key);
  if (sv) return ["all", "saving-throw", sv.key, sv.ability + "-based"];
  const ability = SKILL_ABILITY[key];
  if (ability) return ["all", "skill-check", key, ability + "-based"];
  return ["all"];
}
function spellDomains(ability) { return ["all", "spell-dc", (ability || "cha") + "-based"]; }

/* Active conditions, including the ones the dying track implies. */
function activeConditions(pc) {
  const live = (pc && pc.live) || {};
  const out = (live.conditions || []).map((c) => ({ key: c.key, value: Number(c.value) || 0 }));
  if ((Number(live.dying) || 0) > 0 && !out.some((c) => c.key === "unconscious")) {
    out.push({ key: "unconscious", value: 0, implied: "dying" });
  }
  return out;
}

/* Worst penalty of each type across the active conditions, per PF2e stacking. */
function conditionPenalty(pc, domains) {
  const best = {};
  activeConditions(pc).forEach((c) => {
    (CONDITION_EFFECTS[c.key] || []).forEach((eff) => {
      if (!eff.domains.some((d) => domains.indexOf(d) >= 0)) return;
      const v = eff.scaled ? Math.max(0, c.value) : eff.value;
      if (v <= 0) return;
      if (!best[eff.type] || v > best[eff.type].value) {
        best[eff.type] = {
          value: v,
          label: condLabel(c.key) + (eff.scaled ? " " + c.value : "") + (c.implied ? " (dying)" : ""),
        };
      }
    });
  });
  const parts = Object.keys(best).map((t) => ({ type: t, value: best[t].value, label: best[t].label }));
  return { total: -parts.reduce((n, p) => n + p.value, 0), parts: parts };
}
function penMark(delta) { return String(delta).replace("-", "\u2212"); }
function penaltyNote(parts) { return parts.map((p) => `${p.label} −${p.value} ${p.type}`).join(" · "); }

function baseStat(pc, key) {
  if (key === "perception") return Number(pc.perception) || 0;
  if (key === "ac") return Number(pc.ac) || 0;
  if (key === "classDC") return Number(pc.classDC) || 0;
  if (pc.saves && key in pc.saves) return Number(pc.saves[key]) || 0;
  if (pc.skills && pc.skills[key]) return Number(pc.skills[key].mod) || 0;
  return 0;
}
/* A statistic after the active conditions are applied. */
function effStat(pc, key, domains) {
  const base = baseStat(pc, key);
  const pen = conditionPenalty(pc, domains || statDomains(pc, key));
  return { base: base, delta: pen.total, value: base + pen.total, parts: pen.parts, note: penaltyNote(pen.parts) };
}
function effMod(pc, key) { return effStat(pc, key).value; }

/* Drained lowers maximum HP by level × value. */
function drainedValue(pc) {
  const c = ((pc.live && pc.live.conditions) || []).find((x) => x.key === "drained");
  return c ? Math.max(0, Number(c.value) || 0) : 0;
}
function effMaxHP(pc) {
  const max = Number(pc.hpMax) || 0;
  const d = drainedValue(pc);
  return d ? Math.max(1, max - d * (Number(pc.level) || 1)) : max;
}
/* PF2e: you die at dying 4, or sooner when Doomed. */
function maxDying(pc) { return Math.max(1, 4 - (Number(pc.live && pc.live.doomed) || 0)); }
function isDead(pc) { return (Number(pc.live && pc.live.dying) || 0) >= maxDying(pc); }

/* Render a statistic, showing the conditions penalty when there is one. */
function statHTML(pc, key, opts) {
  const o = opts || {};
  const e = effStat(pc, key, o.domains);
  const shown = o.signed === false ? String(e.value) : sign(e.value);
  if (!e.delta) return shown;
  const base = o.signed === false ? String(e.base) : sign(e.base);
  return `<span class="pen" title="${escapeHtml("Base " + base + " · " + e.note)}">${shown}<span class="penmark">${penMark(e.delta)}</span></span>`;
}

/* ============================================================
   PATHBUILDER PARSER  (verified against a live L2 export)
   Pathbuilder's build.proficiencies stores the proficiency RANK-VALUE
   (0/2/4/6/8), not a total. We compute every final modifier ourselves.
   ============================================================ */
function abilityMod(score) { return Math.floor(((Number(score) || 0) - 10) / 2); }
function profBonus(rankValue, level) { rankValue = Number(rankValue) || 0; return rankValue > 0 ? rankValue + (Number(level) || 0) : 0; }

/* Pure: turn a Pathbuilder export (the full {success,build} object OR a bare
   build) into a PC stat block. Throws on missing core data. */
function parsePathbuilder(root) {
  const b = (root && root.build && typeof root.build === "object") ? root.build : root;
  if (!b || typeof b !== "object") throw new Error("No build data found.");
  if (!b.abilities || !b.proficiencies || !b.attributes) throw new Error("This doesn't look like a Pathbuilder export (missing abilities / proficiencies / attributes).");

  const L = Math.max(1, Math.min(30, Number(b.level) || 1));
  const sc = b.abilities;
  const mods = {};
  ABILITIES.forEach((a) => { mods[a] = abilityMod(sc[a] != null ? sc[a] : 10); });
  const pf = b.proficiencies || {};

  const perception = mods.wis + profBonus(pf.perception, L);

  const saves = {};
  SAVES.forEach((s) => { saves[s.key] = mods[s.ability] + profBonus(pf[s.key], L); });

  const skills = {};
  SKILLS.forEach((s) => {
    const rv = Number(pf[s.key]) || 0;
    const mod = mods[s.ability] + profBonus(rv, L);
    skills[s.key] = { rank: rv, mod: mod, passive: 10 + mod };
  });

  const lores = (b.lores || []).map((entry) => {
    const name = Array.isArray(entry) ? entry[0] : (entry && entry.name);
    const rv = Number(Array.isArray(entry) ? entry[1] : (entry && entry.rank)) || 0;
    const mod = mods.int + profBonus(rv, L);
    return { name: String(name || "Lore"), rank: rv, mod: mod, passive: 10 + mod };
  });

  const key = (b.keyability && sc[b.keyability] != null) ? b.keyability : "str";
  const classDC = 10 + profBonus(pf.classDC, L) + mods[key];

  const at = b.attributes || {};
  const hpMax = (Number(at.ancestryhp) || 0) + (Number(at.bonushp) || 0)
    + ((Number(at.classhp) || 0) + mods.con + (Number(at.bonushpPerLevel) || 0)) * L;
  const speed = (Number(at.speed) || 0) + (Number(at.speedBonus) || 0);

  const senses = (b.specials || []).filter((s) => SENSES.some((k) => k.toLowerCase() === String(s).toLowerCase()));

  const spellcasting = (b.spellCasters || []).map((c) => {
    const ab = (c.ability && sc[c.ability] != null) ? c.ability : "cha";
    const abm = abilityMod(sc[ab] != null ? sc[ab] : 10);
    const rv = Number(c.proficiency) || 0;
    return {
      name: c.name || (titleCase(c.magicTradition) + " spells"),
      tradition: c.magicTradition || "", type: c.spellcastingType || "",
      ability: ab, dc: 10 + profBonus(rv, L) + abm, attack: profBonus(rv, L) + abm,
      focusPoints: Number(c.focusPoints) || 0,
    };
  });
  const focusPool = spellcasting.reduce((n, c) => n + (c.focusPoints || 0), 0);

  const abilities = {}; ABILITIES.forEach((a) => { abilities[a] = Number(sc[a]) || 10; });

  return {
    name: String(b.name || "Unnamed").replace(/\s+/g, " ").trim() || "Unnamed",
    class: b.class || "", dualClass: b.dualClass || null, level: L,
    ancestry: b.ancestry || "", heritage: b.heritage || "", background: b.background || "",
    size: b.size, keyability: key,
    abilities: abilities, mods: mods,
    ac: Number(b.acTotal && b.acTotal.acTotal) || 0,
    perception: perception, perceptionPassive: 10 + perception,
    saves: saves, skills: skills, lores: lores,
    hpMax: hpMax, speed: speed, languages: (b.languages || []).slice(), senses: senses,
    classDC: classDC, spellcasting: spellcasting, focusPool: focusPool,
  };
}

/* Merge a parsed build into the library. Matches an existing PC by pbId (when
   imported by code) or by name, preserving that PC's live session state. */
function commitImport(root, pbId) {
  const parsed = parsePathbuilder(root);       // may throw
  const nameKey = parsed.name.toLowerCase();
  let existing = null;
  if (pbId) existing = pcs().find((p) => p.pbId && String(p.pbId) === String(pbId)) || null;
  if (!existing) existing = pcs().find((p) => p.name.toLowerCase() === nameKey) || null;

  if (existing) {
    const live = existing.live || freshLive(parsed.hpMax);
    Object.assign(existing, parsed);
    existing.pbId = pbId || existing.pbId || null;
    live.hpCur = Math.min(Number(live.hpCur) || parsed.hpMax, parsed.hpMax);
    existing.live = live;
    saveState();
    return { pc: existing, updated: true };
  }
  const pc = Object.assign({ id: uid(), pbId: pbId || null }, parsed);
  pc.live = freshLive(pc.hpMax);
  library.characters[pc.id] = pc;
  library.order.push(pc.id);
  saveState();
  return { pc: pc, updated: false };
}

/* ---- Import UI actions ---- */
function importFromJSON() {
  const ta = document.getElementById("importJSON");
  const raw = (ta.value || "").trim();
  if (!raw) { setImportStatus("Paste a Pathbuilder JSON export first.", true); return; }
  let obj;
  try { obj = JSON.parse(raw); }
  catch (e) { setImportStatus("That isn't valid JSON — copy the whole export.", true); return; }
  try {
    const r = commitImport(obj, null);
    ta.value = "";
    setImportStatus(`${r.updated ? "Updated" : "Imported"} ${r.pc.name}.`, false);
    renderAll();
  } catch (e) { setImportStatus(e.message || "Import failed.", true); }
}
function importFromCode() {
  const input = document.getElementById("importCode");
  const id = (input.value || "").trim().replace(/[^0-9]/g, "");
  if (!id) { setImportStatus("Enter your Pathbuilder export id (the number).", true); return; }
  setImportStatus("Fetching from Pathbuilder…", false);
  fetch("https://pathbuilder2e.com/json.php?id=" + id)
    .then((r) => r.json())
    .then((obj) => {
      if (obj && obj.success === false) throw new Error("Pathbuilder says that id has no build (it may have expired).");
      const r = commitImport(obj, id);
      input.value = "";
      setImportStatus(`${r.updated ? "Updated" : "Imported"} ${r.pc.name}.`, false);
      renderAll();
    })
    .catch(() => {
      setImportStatus("Couldn't fetch automatically (your browser blocked the cross-site request). In Pathbuilder → Export → Export JSON, copy the JSON and paste it below instead.", true);
      const ta = document.getElementById("importJSON"); if (ta) ta.focus();
    });
}
function setImportStatus(msg, isError) {
  const el = document.getElementById("importStatus");
  if (!el) return;
  el.textContent = msg;
  el.className = "importstatus" + (isError ? " err" : msg ? " ok" : "");
}

/* ============================================================
   THEME  (light/dark · custom palette) — adapted from pf2espellcards
   ============================================================ */
const DEFAULT_ACCENT = "#6c7a89";
function hexToRgb(h) { h = (h || "").replace("#", "").trim(); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h || "000000", 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function relLuminance(hex) { const { r, g, b } = hexToRgb(hex); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
function inkFor(hex) { return relLuminance(hex) < 0.48 ? "#ffffff" : "#15171c"; }
function mixHex(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); const c = (k) => Math.round(A[k] + (B[k] - A[k]) * t).toString(16).padStart(2, "0"); return "#" + c("r") + c("g") + c("b"); }
function resolveThemeMode() {
  const m = (library.settings && library.settings.themeMode) || "auto";
  if (m === "light" || m === "dark") return m;
  try { return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light"; }
  catch (e) { return "dark"; }
}
function applyTheme() {
  const root = document.documentElement;
  const custom = (library.settings && library.settings.custom) || null;
  root.dataset.theme = resolveThemeMode();
  const accent = (custom && custom.accent) || DEFAULT_ACCENT;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-ink", inkFor(accent));
  if (custom && custom.bg) root.style.setProperty("--bg", custom.bg); else root.style.removeProperty("--bg");
  if (custom && custom.ink) root.style.setProperty("--ink", custom.ink); else root.style.removeProperty("--ink");
  if (custom && custom.surface) {
    root.style.setProperty("--surface", custom.surface);
    root.style.setProperty("--surface-2", mixHex(custom.surface, custom.ink || "#808080", 0.10));
  } else { root.style.removeProperty("--surface"); root.style.removeProperty("--surface-2"); }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) { const bg = getComputedStyle(root).getPropertyValue("--bg").trim(); if (bg) meta.setAttribute("content", bg); }
}
function themeColorValue(token) { return (getComputedStyle(document.documentElement).getPropertyValue(token) || "").trim() || "#000000"; }
function setThemeMode(m) { library.settings.themeMode = m; saveState(); applyTheme(); renderMenu(); }
function setCustomColor(key, val) { library.settings.custom = library.settings.custom || {}; library.settings.custom[key] = val; saveState(); applyTheme(); }
function resetTheme() { library.settings.custom = null; saveState(); applyTheme(); renderMenu(); }

/* ============================================================
   EVENT DELEGATION
   Generated markup carries data-act (plus data-id / data-key / data-val)
   and is dispatched from one document-level listener, so no value that came
   from an imported character is ever interpolated into an executable
   attribute. (The handful of handlers in the static template take no
   arguments and are left inline.)
   ============================================================ */
const CLICK_ACTIONS = {
  toggleRosterRow: (el) => toggleRosterRow(el.dataset.id),
  exportPC: (el) => exportPC(el.dataset.id),
  deletePC: (el) => deletePC(el.dataset.id),
  setHero: (el) => setHero(el.dataset.id, Number(el.dataset.val)),
  bumpStage: (el) => bumpStage(el.dataset.id, el.dataset.key, Number(el.dataset.val)),
  applyHP: (el) => applyHP(el.dataset.id, Number(el.dataset.val)),
  toggleCondition: (el) => toggleCondition(el.dataset.id, el.dataset.key, el.dataset.valued === "1"),
  bumpCondition: (el) => bumpCondition(el.dataset.id, el.dataset.key, Number(el.dataset.val)),
  removeCondition: (el) => removeCondition(el.dataset.id, el.dataset.key),
  moveMarch: (el) => moveMarch(el.dataset.id, Number(el.dataset.val)),
  rollForParty: () => rollForParty(),
  openMenu: () => openMenu(),
  setThemeMode: (el) => setThemeMode(el.dataset.key),
  resetTheme: () => resetTheme(),
  resetStorage: () => resetStorage(),
};
const CHANGE_ACTIONS = {
  setHP: (el) => setHP(el.dataset.id, el.value),
  setTemp: (el) => setTemp(el.dataset.id, el.value),
  setActivity: (el) => setActivity(el.dataset.id, el.value),
};
const INPUT_ACTIONS = {
  setCustomColor: (el) => setCustomColor(el.dataset.key, el.value),
  refSearch: () => renderRefList(),
};
function dispatchAction(map, e) {
  const el = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
  if (!el) return;
  const fn = map[el.dataset.act];
  if (fn) fn(el);
}
function setupDelegation() {
  document.addEventListener("click", (e) => dispatchAction(CLICK_ACTIONS, e));
  document.addEventListener("change", (e) => dispatchAction(CHANGE_ACTIONS, e));
  document.addEventListener("input", (e) => dispatchAction(INPUT_ACTIONS, e));
  // Enter/Space activate the non-button elements that carry an action (table rows).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = e.target && e.target.closest ? e.target.closest('[data-act][role="button"]') : null;
    if (!el) return;
    e.preventDefault();
    dispatchAction(CLICK_ACTIONS, { target: el });
  });
}

/* ============================================================
   NAVIGATION
   ============================================================ */
const VIEWS = ["roster", "roll", "explore", "reference"];
function go(view) {
  document.getElementById("view-menu").classList.add("hide");
  document.querySelector("nav.tabs").classList.remove("hide");
  document.querySelector("header.top").classList.remove("hide");
  VIEWS.forEach((v) => {
    document.getElementById("view-" + v).classList.toggle("hide", v !== view);
    const nb = document.getElementById("nav-" + v);
    if (nb) nb.classList.toggle("on", v === view);
  });
  window.scrollTo(0, 0);
  render(view);
}
const RENDERERS = { roster: renderRoster, roll: renderRoll, explore: renderExplore, reference: renderReference };
/* A single unreadable character used to throw here and leave the view blank
   for good, since the bad record stays in localStorage. Fail into a panel that
   still offers a backup code and a reset instead. */
function render(view) {
  const fn = RENDERERS[view];
  if (!fn) return;
  try { fn(); } catch (e) { renderFailure(view, e); }
}
function renderFailure(view, err) {
  const el = document.getElementById("view-" + view);
  if (!el) return;
  el.innerHTML = `<div class="panel failure">
    <h2>Something in the saved party couldn't be displayed</h2>
    <p class="meta">${escapeHtml(String((err && err.message) || err))}</p>
    <p class="meta">Copy the backup code below first if you want to keep the data, then reset.</p>
    <textarea id="failureIO" rows="3" readonly></textarea>
    <div class="row tight">
      <button class="btn secondary sm" data-act="openMenu">Open menu</button>
      <button class="btn secondary sm" data-act="resetStorage">Reset saved data</button>
    </div>
  </div>`;
  const ta = document.getElementById("failureIO");
  try { if (ta) ta.value = partyCode(); } catch (e2) { if (ta) ta.value = ""; }
}
function resetStorage() {
  if (!confirm("Delete every character stored in this browser? This can't be undone.")) return;
  try { localStorage.removeItem(LS_KEY); } catch (e) { /* storage disabled */ }
  library = normalizeLib({ characters: {}, order: [], activeId: null });
  renderAll();
  toast("Saved data reset");
}
function currentView() {
  const shown = VIEWS.find((v) => !document.getElementById("view-" + v).classList.contains("hide"));
  return document.getElementById("view-menu").classList.contains("hide") ? (shown || "roster") : "menu";
}
function renderAll() { renderHeader(); const v = currentView(); if (v === "menu") renderMenu(); else render(v); }
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1800);
}

function renderHeader() {
  const n = pcs().length;
  const sub = document.getElementById("partySub");
  if (n === 0) { sub.textContent = "No characters yet — import from Pathbuilder"; return; }
  const avg = Math.round(pcs().reduce((s, p) => s + p.level, 0) / n);
  sub.textContent = `${n} character${n === 1 ? "" : "s"} · average level ${avg}`;
}

/* ============================================================
   ROSTER  (passive-stats dashboard + expand detail + live tracking)
   ============================================================ */
function conditionChipsHTML(pc) {
  const cs = (pc.live.conditions || []);
  const parts = cs.map((c) => `<span class="condchip">${escapeHtml(condLabel(c.key))}${c.value != null ? " " + c.value : ""}</span>`);
  if (isDead(pc)) parts.unshift(`<span class="condchip crit">Dead</span>`);
  else if (pc.live.dying > 0) parts.unshift(`<span class="condchip crit">Dying ${pc.live.dying}/${maxDying(pc)}</span>`);
  if (pc.live.wounded > 0) parts.push(`<span class="condchip">Wounded ${pc.live.wounded}</span>`);
  if (pc.live.doomed > 0) parts.push(`<span class="condchip crit">Doomed ${pc.live.doomed}</span>`);
  return parts.join("");
}
function condLabel(key) {
  const q = QUICK_CONDITIONS.find((c) => c.key === key);
  if (q) return q.label;
  const g = CONDITION_BY_SLUG[key];
  return g ? g.name : titleCase(key.replace(/-/g, " "));
}
function hpBarHTML(pc) {
  const max = effMaxHP(pc) || 1, cur = Math.max(0, Math.min(pc.live.hpCur, max));
  const pct = Math.round((cur / max) * 100);
  const low = pct <= 25, mid = pct <= 50;
  const temp = pc.live.hpTemp > 0 ? `<span class="hptemp">+${pc.live.hpTemp}</span>` : "";
  const drained = drainedValue(pc)
    ? `<span class="penmark" title="${escapeHtml(`Drained ${drainedValue(pc)}: maximum HP reduced by level x value`)}">${penMark(effMaxHP(pc) - pc.hpMax)}</span>` : "";
  return `<div class="hpwrap"><div class="hpbar"><div class="hpfill ${low ? "low" : mid ? "mid" : ""}" style="width:${pct}%"></div></div>
    <div class="hpnum">${cur}/${max}${drained}${temp}</div></div>`;
}
function classLine(pc) {
  const bits = [pc.class || "—", "Lvl " + pc.level];
  return bits.join(" · ");
}
function renderRoster() {
  const wrap = document.getElementById("view-roster");
  const list = pcs();
  if (!list.length) {
    wrap.innerHTML = `<div class="empty">
      <h2>No characters yet</h2>
      <p>Import your players' characters from Pathbuilder to build the party roster.</p>
      <button class="btn" data-act="openMenu">${iconSvg("plus")} Import from Pathbuilder</button>
    </div>`;
    return;
  }
  const rows = list.map((pc) => {
    const open = pc.id === library.activeId;
    const head = `<tr class="rrow ${open ? "open" : ""}" data-act="toggleRosterRow" data-id="${escapeHtml(pc.id)}"
      tabindex="0" role="button" aria-expanded="${open ? "true" : "false"}"
      aria-label="${escapeHtml(pc.name + " — " + classLine(pc) + ", show detail")}">
      <td class="c-name"><div class="pname">${escapeHtml(pc.name)}</div><div class="pmeta">${escapeHtml(classLine(pc))}</div>
        <div class="rconds">${conditionChipsHTML(pc)}</div></td>
      <td class="num strong" data-lbl="AC">${statHTML(pc, "ac", { signed: false })}</td>
      <td class="num" data-lbl="Perception">${statHTML(pc, "perception")}<span class="passv">${10 + effMod(pc, "perception")}</span></td>
      <td class="num" data-lbl="Fort">${statHTML(pc, "fortitude")}</td>
      <td class="num" data-lbl="Ref">${statHTML(pc, "reflex")}</td>
      <td class="num" data-lbl="Will">${statHTML(pc, "will")}</td>
      <td class="num" data-lbl="Speed">${pc.speed}</td>
      <td class="c-hp" data-lbl="HP">${hpBarHTML(pc)}</td>
      <td class="c-exp">${iconSvg("chevron", open ? "flip" : "")}</td>
    </tr>`;
    const detail = open ? `<tr class="rdetail"><td colspan="9">${rosterDetailHTML(pc)}</td></tr>` : "";
    return head + detail;
  }).join("");
  wrap.innerHTML = `<table class="roster">
    <thead><tr>
      <th class="c-name">Character</th><th>AC</th><th>Perc<span class="passv">psv</span></th>
      <th>Fort</th><th>Ref</th><th>Will</th><th>Spd</th><th class="c-hp">HP</th><th class="c-exp"></th>
    </tr></thead>
    <tbody>${rows}</tbody></table>
    <p class="hint">Perception/skill rows show the modifier and, in grey, the <b>passive DC</b> (10 + mod) you use for secret checks.
    Values already include the penalties from a character's active conditions — a red figure beside a number is that penalty; hover it for the breakdown.
    Click a character for full detail and live tracking.</p>`;
}
function toggleRosterRow(id) {
  library.activeId = (library.activeId === id) ? null : id;
  saveState(); render("roster");
}

function rosterDetailHTML(pc) {
  // skills grid
  const skillCells = SKILLS.map((s) => {
    return `<div class="skcell"><span class="skname">${s.label}</span>
      <span class="skmod">${statHTML(pc, s.key)}</span><span class="skpsv">${10 + effMod(pc, s.key)}</span></div>`;
  }).join("");
  const lorePen = conditionPenalty(pc, statDomains(pc, "lore"));
  const loreCells = pc.lores.length ? pc.lores.map((l) => {
    const mod = l.mod + lorePen.total;
    const shown = lorePen.total
      ? `<span class="pen" title="${escapeHtml("Base " + sign(l.mod) + " · " + penaltyNote(lorePen.parts))}">${sign(mod)}<span class="penmark">${penMark(lorePen.total)}</span></span>`
      : sign(mod);
    return `<div class="skcell lore"><span class="skname">${escapeHtml(l.name)} Lore</span>
      <span class="skmod">${shown}</span><span class="skpsv">${10 + mod}</span></div>`;
  }).join("") : "";
  const abils = ABILITIES.map((a) => `<div class="abcell"><span class="ablbl">${ABILITY_LABEL[a]}</span><span class="abmod">${sign(pc.mods[a])}</span></div>`).join("");
  const facts = [];
  if (pc.ancestry) facts.push(`<b>Ancestry</b> ${escapeHtml([pc.heritage, pc.ancestry].filter(Boolean).join(" "))}`);
  if (pc.background) facts.push(`<b>Background</b> ${escapeHtml(pc.background)}`);
  facts.push(`<b>Class DC</b> ${statHTML(pc, "classDC", { signed: false })}`);
  if (pc.senses.length) facts.push(`<b>Senses</b> ${escapeHtml(pc.senses.join(", "))}`);
  if (pc.languages.length) facts.push(`<b>Languages</b> ${escapeHtml(pc.languages.join(", "))}`);
  const casters = pc.spellcasting.map((c) => {
    const pen = conditionPenalty(pc, spellDomains(c.ability));
    const mark = pen.total ? `<span class="penmark" title="${escapeHtml(penaltyNote(pen.parts))}">${penMark(pen.total)}</span>` : "";
    return `<span class="castchip">${escapeHtml(c.name)}: DC ${c.dc + pen.total} · atk ${sign(c.attack + pen.total)}${mark}</span>`;
  }).join("");
  const focus = pc.focusPool > 0 ? `<span class="castchip">Focus points: ${pc.focusPool}</span>` : "";

  return `<div class="detail">
    <div class="dsec">
      <div class="dsec-h">Abilities</div>
      <div class="abrow">${abils}</div>
    </div>
    <div class="dsec">
      <div class="dsec-h">Skills <span class="dsec-note">mod · passive DC</span></div>
      <div class="skgrid">${skillCells}${loreCells}</div>
    </div>
    <div class="dsec">
      <div class="dsec-h">Details</div>
      <div class="dfacts">${facts.map((f) => `<div>${f}</div>`).join("")}</div>
      ${(casters || focus) ? `<div class="castrow">${casters}${focus}</div>` : ""}
    </div>
    <div class="dsec live">
      <div class="dsec-h">Live tracking</div>
      ${liveTrackingHTML(pc)}
    </div>
    <div class="dactions">
      <button class="btn secondary sm" data-act="exportPC" data-id="${escapeHtml(pc.id)}">Export character code</button>
    </div>
  </div>`;
}

/* ---- Live tracking controls ---- */
function liveTrackingHTML(pc) {
  const id = escapeHtml(pc.id);
  const max = effMaxHP(pc);
  const hero = [0, 1, 2, 3].map((i) => `<button class="pip ${i < pc.live.heroPoints ? "full" : ""}" title="${i + 1} hero point${i ? "s" : ""}"
    aria-label="Set ${i + 1} hero point${i ? "s" : ""}" data-act="setHero" data-id="${id}" data-val="${i + 1}"></button>`).join("");
  const stepper = (label, val, key, suffix) => `<div class="stepper"><span class="stlbl">${label}</span>
    <button class="stbtn" aria-label="Decrease ${label}" data-act="bumpStage" data-id="${id}" data-key="${key}" data-val="-1">−</button>
    <span class="stval ${val > 0 ? "on" : ""}">${val}${suffix || ""}</span>
    <button class="stbtn" aria-label="Increase ${label}" data-act="bumpStage" data-id="${id}" data-key="${key}" data-val="1">+</button></div>`;
  const quick = QUICK_CONDITIONS.map((c) => {
    const on = pc.live.conditions.find((x) => x.key === c.key);
    return `<button class="condbtn ${on ? "on" : ""}" aria-pressed="${on ? "true" : "false"}"
      data-act="toggleCondition" data-id="${id}" data-key="${escapeHtml(c.key)}" data-valued="${c.valued ? "1" : "0"}">${c.label}${on && on.value != null ? " " + on.value : ""}</button>`;
  }).join("");
  const active = pc.live.conditions.map((c) => {
    const cfg = QUICK_CONDITIONS.find((q) => q.key === c.key);
    const valued = cfg ? cfg.valued : (c.value != null);
    const key = escapeHtml(c.key), label = condLabel(c.key);
    const val = valued ? `<button class="stbtn" aria-label="Decrease ${escapeHtml(label)}" data-act="bumpCondition" data-id="${id}" data-key="${key}" data-val="-1">−</button><span class="stval on">${Number(c.value) || 0}</span><button class="stbtn" aria-label="Increase ${escapeHtml(label)}" data-act="bumpCondition" data-id="${id}" data-key="${key}" data-val="1">+</button>` : "";
    return `<span class="activecond">${escapeHtml(label)} ${val}<button class="condx" aria-label="Remove ${escapeHtml(label)}" data-act="removeCondition" data-id="${id}" data-key="${key}">${iconSvg("x")}</button></span>`;
  }).join("");
  const dead = isDead(pc) ? `<div class="deadnote">Dying ${pc.live.dying} of ${maxDying(pc)} — this character is dead.</div>` : "";

  return `<div class="livewrap">
    ${dead}
    <div class="liverow">
      <div class="hpctl">
        <span class="stlbl">HP</span>
        <input type="number" class="hpin" id="hpin-${id}" value="${pc.live.hpCur}" min="0" max="${max}" aria-label="Current HP"
          data-act="setHP" data-id="${id}"> / ${max}
        <input type="number" class="amtin" id="amt-${id}" placeholder="#" min="0" aria-label="Damage or healing amount">
        <button class="stbtn harm" data-act="applyHP" data-id="${id}" data-val="-1">Damage</button>
        <button class="stbtn heal" data-act="applyHP" data-id="${id}" data-val="1">Heal</button>
        <span class="stlbl">Temp</span>
        <input type="number" class="hpin" value="${pc.live.hpTemp}" min="0" aria-label="Temporary HP" data-act="setTemp" data-id="${id}">
      </div>
      <div class="heroctl"><span class="stlbl">Hero</span>${hero}</div>
    </div>
    <div class="liverow">
      ${stepper("Wounded", pc.live.wounded, "wounded")}
      ${stepper("Dying", pc.live.dying, "dying", " / " + maxDying(pc))}
      ${stepper("Doomed", pc.live.doomed, "doomed")}
    </div>
    ${active ? `<div class="activeconds">${active}</div>` : ""}
    <div class="condbtns">${quick}</div>
  </div>`;
}

function withPC(id, fn) { const pc = pcById(id); if (!pc) return; fn(pc); saveState(); render("roster"); }
/* PF2e death and dying: dropping to 0 HP makes you dying 1 + your wounded value;
   regaining any HP while dying clears dying and adds 1 to wounded. Applied to a
   PC whose HP just changed, given what it was before. */
function syncDying(pc, before) {
  const live = pc.live;
  if (before > 0 && live.hpCur === 0 && live.dying === 0) {
    live.dying = clamp(1 + (Number(live.wounded) || 0), 1, maxDying(pc));
  } else if (before === 0 && live.hpCur > 0 && live.dying > 0) {
    live.dying = 0;
    live.wounded = clamp((Number(live.wounded) || 0) + 1, 0, 3);
  }
}
function setHP(id, v) {
  withPC(id, (pc) => {
    const before = pc.live.hpCur;
    pc.live.hpCur = clamp(Math.round(Number(v) || 0), 0, effMaxHP(pc));
    syncDying(pc, before);
  });
}
function setTemp(id, v) { withPC(id, (pc) => { pc.live.hpTemp = Math.max(0, Math.round(Number(v) || 0)); }); }
function applyHP(id, dir) {
  const amtEl = document.getElementById("amt-" + id);
  let amt = Math.abs(Math.round(Number(amtEl && amtEl.value) || 0));
  if (!amt) amt = 1;
  withPC(id, (pc) => {
    const before = pc.live.hpCur;
    if (dir < 0) {
      let dmg = amt;
      if (pc.live.hpTemp > 0) { const absorbed = Math.min(pc.live.hpTemp, dmg); pc.live.hpTemp -= absorbed; dmg -= absorbed; }
      pc.live.hpCur = clamp(pc.live.hpCur - dmg, 0, effMaxHP(pc));
    } else {
      pc.live.hpCur = clamp(pc.live.hpCur + amt, 0, effMaxHP(pc));
    }
    syncDying(pc, before);
  });
}
function setHero(id, n) { withPC(id, (pc) => { pc.live.heroPoints = (pc.live.heroPoints === n) ? n - 1 : n; if (pc.live.heroPoints < 0) pc.live.heroPoints = 0; }); }
function bumpStage(id, key, delta) {
  withPC(id, (pc) => {
    const caps = { wounded: 3, dying: maxDying(pc), doomed: 3 };
    pc.live[key] = clamp((pc.live[key] || 0) + delta, 0, caps[key] || 9);
    // raising Doomed lowers the threshold you die at, so re-clamp Dying too
    pc.live.dying = clamp(pc.live.dying, 0, maxDying(pc));
  });
}
function toggleCondition(id, key, valued) {
  withPC(id, (pc) => {
    const i = pc.live.conditions.findIndex((c) => c.key === key);
    if (i >= 0) pc.live.conditions.splice(i, 1);
    else pc.live.conditions.push({ key: key, value: valued ? 1 : null });
    pc.live.hpCur = clamp(pc.live.hpCur, 0, effMaxHP(pc));   // Drained lowers maximum HP
  });
}
function bumpCondition(id, key, delta) {
  withPC(id, (pc) => {
    const c = pc.live.conditions.find((x) => x.key === key); if (!c) return;
    c.value = (Number(c.value) || 0) + delta;
    if (c.value < 1) pc.live.conditions = pc.live.conditions.filter((x) => x.key !== key);
    pc.live.hpCur = clamp(pc.live.hpCur, 0, effMaxHP(pc));   // Drained lowers maximum HP
  });
}
function removeCondition(id, key) { withPC(id, (pc) => { pc.live.conditions = pc.live.conditions.filter((x) => x.key !== key); }); }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

/* ============================================================
   SECRET-CHECK ROLLER
   ============================================================ */
let _lastRoll = null;
function rollOptions() {
  const opts = [`<option value="perception">Perception</option>`];
  opts.push(`<optgroup label="Saves">` + SAVES.map((s) => `<option value="${s.key}">${s.full}</option>`).join("") + `</optgroup>`);
  opts.push(`<optgroup label="Skills">` + SKILLS.map((s) => `<option value="${s.key}">${s.label}</option>`).join("") + `</optgroup>`);
  return opts.join("");
}
function renderRoll() {
  const wrap = document.getElementById("view-roll");
  if (!pcs().length) { wrap.innerHTML = emptyHint("Import characters to roll checks for the party."); return; }
  wrap.innerHTML = `<div class="panel">
    <div class="rollbar">
      <label class="field inline"><span class="name">Check</span>
        <select id="rollStat">${rollOptions()}</select></label>
      <label class="field inline dc"><span class="name">DC <span class="hint">optional</span></span>
        <input type="number" id="rollDC" placeholder="—" min="1"></label>
      <button class="btn sm" data-act="rollForParty">${iconSvg("roll")} Roll for party</button>
    </div>
    <p class="hint">Rolls a secret <b>d20 + modifier</b> for every character at once — Perception doubles as initiative. Set a DC to colour the degrees of success (natural 20 / 1 shift one step, per PF2e). Modifiers include the penalties from each character's active conditions.</p>
    <div id="rollResults"></div>
  </div>`;
  if (_lastRoll) { document.getElementById("rollStat").value = _lastRoll.stat; if (_lastRoll.dc != null) document.getElementById("rollDC").value = _lastRoll.dc; renderRollResults(); }
}
function d20() { return 1 + Math.floor(Math.random() * 20); }
function degreeOf(total, natural, dc) {
  if (dc == null || dc === "") return null;
  dc = Number(dc);
  let d = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  if (natural === 20) d = Math.min(3, d + 1); else if (natural === 1) d = Math.max(0, d - 1);
  return d;
}
const DEGREE = [{ t: "Crit Fail", c: "cfail" }, { t: "Failure", c: "fail" }, { t: "Success", c: "succ" }, { t: "Crit Success", c: "csucc" }];
function pcStatMod(pc, key) { return effMod(pc, key); }
function statLabel(key) {
  if (key === "perception") return "Perception";
  const sv = SAVES.find((s) => s.key === key); if (sv) return sv.full;
  const sk = SKILLS.find((s) => s.key === key); if (sk) return sk.label;
  return titleCase(key);
}
function rollForParty() {
  const stat = document.getElementById("rollStat").value;
  const dcRaw = document.getElementById("rollDC").value;
  const dc = dcRaw === "" ? null : Number(dcRaw);
  const rolls = pcs().map((pc) => {
    const e = effStat(pc, stat), nat = d20(), total = nat + e.value;
    return { id: pc.id, name: pc.name, nat: nat, mod: e.value, note: e.note, total: total, degree: degreeOf(total, nat, dc) };
  }).sort((a, b) => b.total - a.total || b.nat - a.nat);
  _lastRoll = { stat: stat, dc: dc, rolls: rolls };
  renderRollResults();
}
function renderRollResults() {
  const box = document.getElementById("rollResults"); if (!box || !_lastRoll) return;
  const { stat, dc, rolls } = _lastRoll;
  const head = `<div class="rollhead">${escapeHtml(statLabel(stat))} check${dc != null ? ` vs DC ${dc}` : ""}</div>`;
  const rows = rolls.map((r) => {
    const deg = r.degree != null ? `<span class="deg ${DEGREE[r.degree].c}">${DEGREE[r.degree].t}</span>` : "";
    const natTag = r.nat === 20 ? `<span class="nat nat20">20</span>` : r.nat === 1 ? `<span class="nat nat1">1</span>` : `<span class="natp">${r.nat}</span>`;
    const note = r.note ? `<span class="rnote" title="${escapeHtml(r.note)}">${escapeHtml(r.note)}</span>` : "";
    return `<div class="rollrow ${r.degree != null ? DEGREE[r.degree].c : ""}">
      <span class="rname">${escapeHtml(r.name)}${note}</span>
      <span class="rmath">${natTag} ${sign(r.mod)}</span>
      <span class="rtotal">${r.total}</span>${deg}</div>`;
  }).join("");
  box.innerHTML = head + `<div class="rolllist">${rows}</div>
    <button class="btn secondary sm" data-act="rollForParty">Roll again</button>`;
}

/* ============================================================
   EXPLORATION BOARD
   ============================================================ */
function exploreOrder() {
  const mo = library.board.marchOrder.filter((id) => library.characters[id]);
  pcs().forEach((p) => { if (!mo.includes(p.id)) mo.push(p.id); });
  return mo.map((id) => library.characters[id]);
}
function renderExplore() {
  const wrap = document.getElementById("view-explore");
  if (!pcs().length) { wrap.innerHTML = emptyHint("Import characters to assign exploration activities."); return; }
  const order = exploreOrder();
  const rows = order.map((pc, i) => {
    const act = library.board.assignments[pc.id] || "";
    const cfg = act ? EXPLORATION_BY_KEY[act] : null;
    const govMod = cfg ? governingMod(pc, cfg) : null;
    const govText = cfg ? (govMod != null ? `${titleCase(cfg.governing === "perception" ? "Perception" : cfg.governing)} ${sign(govMod)}`
      : (cfg.governing === "varies" ? "varies" : "no roll")) : "";
    const options = `<option value="">— none —</option>` + EXPLORATION_ACTIVITIES.map((a) =>
      `<option value="${a.key}" ${a.key === act ? "selected" : ""}>${a.label}</option>`).join("");
    const id = escapeHtml(pc.id);
    return `<div class="exprow">
      <div class="expord"><button class="ordbtn" data-act="moveMarch" data-id="${id}" data-val="-1" title="Move up" aria-label="Move ${escapeHtml(pc.name)} up">${iconSvg("up")}</button>
        <span class="ordnum">${i + 1}</span>
        <button class="ordbtn" data-act="moveMarch" data-id="${id}" data-val="1" title="Move down" aria-label="Move ${escapeHtml(pc.name)} down">${iconSvg("down")}</button></div>
      <div class="expname"><div class="pname">${escapeHtml(pc.name)}</div><div class="pmeta">${escapeHtml(classLine(pc))}</div></div>
      <div class="expsel"><select data-act="setActivity" data-id="${id}" aria-label="Exploration activity for ${escapeHtml(pc.name)}">${options}</select></div>
      <div class="expgov">${govText ? `<span class="govmod">${govText}</span>` : ""}</div>
      <div class="expnote">${cfg ? escapeHtml(cfg.short) : ""}</div>
    </div>`;
  }).join("");
  wrap.innerHTML = `<div class="panel">
    <div class="expboard">
      <div class="exphead"><span>Order</span><span>Character</span><span>Activity</span><span>Modifier</span><span>What it does</span></div>
      ${rows}
    </div>
    <p class="hint">Assign each character an exploration activity and marching order. The modifier is the statistic a GM most often references — click a term in <b>Reference</b> for the full rules.</p>
  </div>`;
}
function governingMod(pc, cfg) {
  if (!cfg) return null;
  if (cfg.governing === "perception") return effMod(pc, "perception");
  if (pc.skills && pc.skills[cfg.governing]) return effMod(pc, cfg.governing);
  return null;
}
function setActivity(id, key) {
  if (key) library.board.assignments[id] = key; else delete library.board.assignments[id];
  saveState(); render("explore");
}
function moveMarch(id, delta) {
  const order = exploreOrder().map((p) => p.id);
  const i = order.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return;
  order.splice(j, 0, order.splice(i, 1)[0]);
  library.board.marchOrder = order; saveState(); render("explore");
}

/* ============================================================
   REFERENCE VIEWER  (conditions + actions from Foundry data)
   ============================================================ */
function refItems() {
  const conds = CONDITIONS.map((c) => ({ kind: "Condition", name: c.name, slug: c.slug, desc: c.description }));
  const acts = ACTIONS.map((a) => ({ kind: a.exploration ? "Exploration" : titleCase(a.category || "Action"), name: a.name, slug: a.slug, desc: a.description }));
  // fall back to hand-authored exploration blurbs if the generated data is empty
  if (!acts.length) EXPLORATION_ACTIVITIES.forEach((a) => acts.push({ kind: "Exploration", name: a.label, slug: a.key, desc: a.short }));
  return conds.concat(acts).sort((a, b) => a.name.localeCompare(b.name));
}
function renderReference() {
  const wrap = document.getElementById("view-reference");
  wrap.innerHTML = `<div class="panel">
    <div class="searchbar">${iconSvg("search")}<input type="text" id="refSearch" placeholder="Search conditions & actions…" aria-label="Search conditions and actions" data-act="refSearch"></div>
    <div id="refList"></div>
    <p class="hint">${REF_META.generated ? `Condition & action text from the Foundry pf2e data (${escapeHtml(String(REF_META.sourceCommit || ""))}). Paizo content, OGL/ORC.` : `Showing built-in summaries. Run <b>npm run build:ref</b> to bundle the full Foundry-derived rules text.`}</p>
  </div>`;
  renderRefList();
}
function renderRefList() {
  const box = document.getElementById("refList"); if (!box) return;
  const q = (document.getElementById("refSearch").value || "").toLowerCase().trim();
  const items = refItems().filter((it) => !q || it.name.toLowerCase().includes(q) || (it.desc || "").toLowerCase().includes(q));
  if (!items.length) { box.innerHTML = `<p class="empty">Nothing matches “${escapeHtml(q)}”.</p>`; return; }
  box.innerHTML = items.map((it) => `<details class="ref"><summary><span class="refname">${escapeHtml(it.name)}</span><span class="refkind">${escapeHtml(it.kind)}</span></summary>
    <div class="refbody">${textToHtml(it.desc || "")}</div></details>`).join("");
}

/* ============================================================
   MENU  (characters · import · backup · appearance)
   ============================================================ */
function openMenu() {
  VIEWS.forEach((v) => document.getElementById("view-" + v).classList.add("hide"));
  document.querySelector("nav.tabs").classList.add("hide");
  document.getElementById("view-menu").classList.remove("hide");
  renderMenu(); window.scrollTo(0, 0);
}
function closeMenu() { go("roster"); }
function renderMenu() {
  const list = pcs();
  const chars = list.length ? list.map((pc) => `<div class="charcard">
    <div class="txt"><div class="nm">${escapeHtml(pc.name)}</div><div class="tl">${escapeHtml(classLine(pc))}${pc.pbId ? ` · <span class="hint">PB ${escapeHtml(String(pc.pbId))}</span>` : ""}</div></div>
    <button class="rmrow" title="Remove" aria-label="Remove ${escapeHtml(pc.name)}" data-act="deletePC" data-id="${escapeHtml(pc.id)}">${iconSvg("x")}</button>
  </div>`).join("") : `<p class="meta">No characters yet.</p>`;

  document.getElementById("menuList").innerHTML = chars;
  renderAppearance();
  showInstallButton(!!deferredInstall);
  const ds = document.getElementById("dataStamp");
  if (ds) ds.textContent = REF_META.generated ? `Reference data ${REF_META.generated} · ${REF_META.conditions} conditions · ${REF_META.actions} actions` : "";
}
function renderAppearance() {
  const box = document.getElementById("appearancePanel"); if (!box) return;
  const mode = (library.settings && library.settings.themeMode) || "auto";
  const seg = ["light", "dark", "auto"].map((m) => `<button class="${mode === m ? "on" : ""}" aria-pressed="${mode === m ? "true" : "false"}" data-act="setThemeMode" data-key="${m}">${titleCase(m)}</button>`).join("");
  const rows = [["Background", "bg", "--bg"], ["Surface", "surface", "--surface"], ["Text", "ink", "--ink"], ["Accent", "accent", "--accent"]]
    .map(([label, key, token]) => `<div class="swatchrow"><label>${label}</label>
      <input type="color" value="${themeColorValue(token)}" data-act="setCustomColor" data-key="${key}" aria-label="${label} colour"></div>`).join("");
  box.innerHTML = `<div class="seg">${seg}</div>${rows}
    <button class="btn secondary sm" data-act="resetTheme">Reset colours</button>`;
}
function deletePC(id) {
  if (!confirm("Remove this character from the party?")) return;
  delete library.characters[id];
  library.order = library.order.filter((x) => x !== id);
  library.board.marchOrder = library.board.marchOrder.filter((x) => x !== id);
  delete library.board.assignments[id];
  if (library.activeId === id) library.activeId = null;
  saveState(); renderMenu(); renderHeader();
}

/* ---- Export / import codes ---- */
function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64decode(str) { return decodeURIComponent(escape(atob(str))); }
function exportPC(id) {
  const pc = pcById(id); if (!pc) return;
  const clean = Object.assign({}, pc); delete clean.id; delete clean.live;
  const code = "PF2EP1:" + b64encode(JSON.stringify(clean));
  copyToClipboard(code, "Character code copied");
  const ta = document.getElementById("backupIO"); if (ta) ta.value = code;
}
/* The exploration board is keyed by character id, so the ids travel with the
   party and are remapped on import — otherwise the marching order and every
   activity assignment would arrive pointing at characters that no longer exist. */
function partyCode() {
  const payload = {
    characters: library.order.map((id) => Object.assign({}, library.characters[id])),
    board: library.board,
  };
  return "PF2EPARTY1:" + b64encode(JSON.stringify(payload));
}
function exportParty() {
  const code = partyCode();
  const ta = document.getElementById("backupIO"); if (ta) { ta.value = code; ta.focus(); ta.select(); }
  copyToClipboard(code, "Party code copied");
}

/* Take a character out of a backup code into the library, matching an existing
   PC by Pathbuilder id or name the same way an import does, so re-importing a
   code updates the party instead of duplicating it. */
function adoptCharacter(raw) {
  const incoming = normalizeCharacter(Object.assign({}, raw));
  const hadLive = !!(raw && raw.live);
  const nameKey = incoming.name.toLowerCase();
  let existing = null;
  if (incoming.pbId) existing = pcs().find((p) => p.pbId && String(p.pbId) === String(incoming.pbId)) || null;
  if (!existing) existing = pcs().find((p) => p.name.toLowerCase() === nameKey) || null;

  if (existing) {
    const keepLive = hadLive ? incoming.live : existing.live;
    const id = existing.id;
    Object.assign(existing, incoming);
    existing.id = id;
    existing.live = keepLive;
    existing.live.hpCur = clamp(existing.live.hpCur, 0, effMaxHP(existing));
    return { pc: existing, updated: true };
  }
  incoming.id = uid();
  if (!hadLive) incoming.live = freshLive(incoming.hpMax);
  library.characters[incoming.id] = incoming;
  library.order.push(incoming.id);
  return { pc: incoming, updated: false };
}
/* Fold an imported board in, translating the exporting device's ids. */
function mergeBoard(board, idMap) {
  if (!board || typeof board !== "object") return;
  const remap = (id) => idMap[id] || (library.characters[id] ? id : null);
  Object.keys(board.assignments || {}).forEach((oldId) => {
    const id = remap(oldId), act = board.assignments[oldId];
    if (id && EXPLORATION_BY_KEY[act]) library.board.assignments[id] = act;
  });
  const order = (board.marchOrder || []).map(remap).filter(Boolean);
  library.board.marchOrder = order.concat(library.board.marchOrder.filter((id) => order.indexOf(id) < 0));
}
function importBackup() {
  const ta = document.getElementById("backupIO");
  const code = ((ta && ta.value) || "").trim();
  if (!code) { toast("Paste a code first"); return; }
  try {
    if (code.startsWith("PF2EPARTY1:")) {
      const payload = JSON.parse(b64decode(code.slice("PF2EPARTY1:".length)));
      const chars = Array.isArray(payload.characters) ? payload.characters : [];
      const idMap = {};
      let added = 0, updated = 0;
      chars.forEach((c) => {
        const oldId = c && c.id ? String(c.id) : null;
        const r = adoptCharacter(c);
        if (oldId) idMap[oldId] = r.pc.id;
        if (r.updated) updated++; else added++;
      });
      mergeBoard(payload.board, idMap);
      library = normalizeLib(library);
      saveState();
      toast(`Imported ${added} character${added === 1 ? "" : "s"}${updated ? `, updated ${updated}` : ""}`);
    } else if (code.startsWith("PF2EP1:")) {
      const r = adoptCharacter(JSON.parse(b64decode(code.slice("PF2EP1:".length))));
      library = normalizeLib(library);
      saveState();
      toast(`${r.updated ? "Updated" : "Imported"} ${r.pc.name}`);
    } else { throw new Error("unrecognised code"); }
    if (ta) ta.value = "";
    renderAll();
  } catch (e) {
    toast("That code didn't work — paste the whole thing");
  }
}
function copyToClipboard(text, okMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(okMsg)).catch(() => toast("Copied to the box below"));
  else toast("Copied to the box below");
}

function emptyHint(msg) { return `<div class="empty"><p>${escapeHtml(msg)}</p><button class="btn" data-act="openMenu">${iconSvg("plus")} Import from Pathbuilder</button></div>`; }

/* ============================================================
   PWA / OFFLINE
   ============================================================ */
let deferredInstall = null;
function isHeadless() { try { return /jsdom/i.test(navigator.userAgent) || !("onbeforeinstallprompt" in window || "serviceWorker" in navigator); } catch (e) { return true; } }
function setupInstall() {
  if (isHeadless()) return;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; showInstallButton(true); });
  window.addEventListener("appinstalled", () => { deferredInstall = null; showInstallButton(false); toast("App installed"); });
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
function showInstallButton(show) { const b = document.getElementById("installBtn"); if (b) b.style.display = show ? "" : "none"; }
function installApp() { if (!deferredInstall) return; deferredInstall.prompt(); deferredInstall.userChoice.finally(() => { deferredInstall = null; showInstallButton(false); }); }
function downloadOffline() {
  const doIt = (html) => {
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "pf2e-party-tracker.html"; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  fetch(location.href).then((r) => r.text()).then(doIt).catch(() => doIt("<!doctype html>" + document.documentElement.outerHTML));
}

/* ============================================================
   BOOT
   ============================================================ */
function boot() {
  applyTheme();
  setupDelegation();
  renderHeader();
  go("roster");
  setupInstall();
}
/* The engine script is injected at the end of <body>, so every view element
   already exists — boot synchronously (no first-paint flash, and tests see a
   rendered DOM immediately). */
if (typeof document !== "undefined") boot();
