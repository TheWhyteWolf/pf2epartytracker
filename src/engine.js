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
function normalizeLib(lib) {
  lib.characters = lib.characters || {};
  lib.order = Array.isArray(lib.order) ? lib.order.filter((id) => lib.characters[id]) : [];
  // back-fill order with any characters missing from it
  Object.keys(lib.characters).forEach((id) => { if (!lib.order.includes(id)) lib.order.push(id); });
  Object.keys(lib.characters).forEach((id) => {
    const c = lib.characters[id];
    c.id = id;
    c.live = Object.assign(freshLive(c.hpMax), c.live || {});
    if (!Array.isArray(c.live.conditions)) c.live.conditions = [];
  });
  lib.board = Object.assign(defaultBoard(), lib.board || {});
  lib.board.marchOrder = (lib.board.marchOrder || []).filter((id) => lib.characters[id]);
  lib.settings = Object.assign(defaultSettings(), lib.settings || {});
  if (!lib.characters[lib.activeId]) lib.activeId = null;
  return lib;
}
let _storageWarned = false;
function saveState() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(library)); }
  catch (e) { if (!_storageWarned && typeof toast === "function") { toast("Couldn't save — storage full or disabled"); _storageWarned = true; } }
}
function saveSettings() { saveState(); }

/* Ordered list of PCs (respecting library.order). */
function pcs() { return library.order.map((id) => library.characters[id]).filter(Boolean); }
function pcById(id) { return library.characters[id] || null; }

/* ============================================================
   FORMATTING HELPERS
   ============================================================ */
function sign(n) { n = Number(n) || 0; return (n >= 0 ? "+" : "") + n; }
function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function textToHtml(s) { return escapeHtml(s).replace(/\n/g, "<br>"); }
function titleCase(s) { s = String(s || ""); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

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
    hpMax: hpMax, speed: speed, speeds: {}, languages: (b.languages || []).slice(), senses: senses,
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
function setThemeMode(m) { library.settings.themeMode = m; saveSettings(); applyTheme(); renderMenu(); }
function setCustomColor(key, val) { library.settings.custom = library.settings.custom || {}; library.settings.custom[key] = val; saveSettings(); applyTheme(); }
function resetTheme() { library.settings.custom = null; saveSettings(); applyTheme(); renderMenu(); }

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
function render(view) {
  if (view === "roster") renderRoster();
  else if (view === "roll") renderRoll();
  else if (view === "explore") renderExplore();
  else if (view === "reference") renderReference();
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
  if (pc.live.dying > 0) parts.unshift(`<span class="condchip crit">Dying ${pc.live.dying}</span>`);
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
  const max = pc.hpMax || 1, cur = Math.max(0, Math.min(pc.live.hpCur, max));
  const pct = Math.round((cur / max) * 100);
  const low = pct <= 25, mid = pct <= 50;
  const temp = pc.live.hpTemp > 0 ? `<span class="hptemp">+${pc.live.hpTemp}</span>` : "";
  return `<div class="hpwrap"><div class="hpbar"><div class="hpfill ${low ? "low" : mid ? "mid" : ""}" style="width:${pct}%"></div></div>
    <div class="hpnum">${cur}/${max}${temp}</div></div>`;
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
      <button class="btn" onclick="openMenu()">${iconSvg("plus")} Import from Pathbuilder</button>
    </div>`;
    return;
  }
  const rows = list.map((pc) => {
    const open = pc.id === library.activeId;
    const head = `<tr class="rrow ${open ? "open" : ""}" onclick="toggleRosterRow('${pc.id}')">
      <td class="c-name"><div class="pname">${escapeHtml(pc.name)}</div><div class="pmeta">${escapeHtml(classLine(pc))}</div>
        <div class="rconds">${conditionChipsHTML(pc)}</div></td>
      <td class="num strong" data-lbl="AC">${pc.ac}</td>
      <td class="num" data-lbl="Perception">${sign(pc.perception)}<span class="passv">${pc.perceptionPassive}</span></td>
      <td class="num" data-lbl="Fort">${sign(pc.saves.fortitude)}</td>
      <td class="num" data-lbl="Ref">${sign(pc.saves.reflex)}</td>
      <td class="num" data-lbl="Will">${sign(pc.saves.will)}</td>
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
    <p class="hint">Perception/skill rows show the modifier and, in grey, the <b>passive DC</b> (10 + mod) you use for secret checks. Click a character for full detail and live tracking.</p>`;
}
function toggleRosterRow(id) {
  library.activeId = (library.activeId === id) ? null : id;
  saveState(); renderRoster();
}

function rosterDetailHTML(pc) {
  // skills grid
  const skillCells = SKILLS.map((s) => {
    const sk = pc.skills[s.key];
    return `<div class="skcell"><span class="skname">${s.label}</span>
      <span class="skmod">${sign(sk.mod)}</span><span class="skpsv">${sk.passive}</span></div>`;
  }).join("");
  const loreCells = pc.lores.length ? pc.lores.map((l) =>
    `<div class="skcell lore"><span class="skname">${escapeHtml(l.name)} Lore</span>
      <span class="skmod">${sign(l.mod)}</span><span class="skpsv">${l.passive}</span></div>`).join("") : "";
  const abils = ABILITIES.map((a) => `<div class="abcell"><span class="ablbl">${ABILITY_LABEL[a]}</span><span class="abmod">${sign(pc.mods[a])}</span></div>`).join("");
  const facts = [];
  if (pc.ancestry) facts.push(`<b>Ancestry</b> ${escapeHtml([pc.heritage, pc.ancestry].filter(Boolean).join(" "))}`);
  if (pc.background) facts.push(`<b>Background</b> ${escapeHtml(pc.background)}`);
  facts.push(`<b>Class DC</b> ${pc.classDC}`);
  if (pc.senses.length) facts.push(`<b>Senses</b> ${escapeHtml(pc.senses.join(", "))}`);
  if (pc.languages.length) facts.push(`<b>Languages</b> ${escapeHtml(pc.languages.join(", "))}`);
  const casters = pc.spellcasting.map((c) =>
    `<span class="castchip">${escapeHtml(c.name)}: DC ${c.dc} · atk ${sign(c.attack)}</span>`).join("");
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
      <button class="btn secondary sm" onclick="exportPC('${pc.id}')">Export character code</button>
    </div>
  </div>`;
}

/* ---- Live tracking controls ---- */
function liveTrackingHTML(pc) {
  const hero = [0, 1, 2, 3].map((i) => `<button class="pip ${i < pc.live.heroPoints ? "full" : ""}" title="${i + 1} hero point${i ? "s" : ""}" onclick="setHero('${pc.id}',${i + 1})"></button>`).join("");
  const stepper = (label, val, key, max) => `<div class="stepper"><span class="stlbl">${label}</span>
    <button class="stbtn" onclick="bumpStage('${pc.id}','${key}',-1)">−</button>
    <span class="stval ${val > 0 ? "on" : ""}">${val}</span>
    <button class="stbtn" onclick="bumpStage('${pc.id}','${key}',1)">+</button></div>`;
  const quick = QUICK_CONDITIONS.map((c) => {
    const on = pc.live.conditions.find((x) => x.key === c.key);
    return `<button class="condbtn ${on ? "on" : ""}" onclick="toggleCondition('${pc.id}','${c.key}',${c.valued})">${c.label}${on && on.value != null ? " " + on.value : ""}</button>`;
  }).join("");
  const active = pc.live.conditions.map((c) => {
    const cfg = QUICK_CONDITIONS.find((q) => q.key === c.key);
    const valued = cfg ? cfg.valued : (c.value != null);
    const val = valued ? `<button class="stbtn" onclick="bumpCondition('${pc.id}','${c.key}',-1)">−</button><span class="stval on">${c.value}</span><button class="stbtn" onclick="bumpCondition('${pc.id}','${c.key}',1)">+</button>` : "";
    return `<span class="activecond">${escapeHtml(condLabel(c.key))} ${val}<button class="condx" onclick="removeCondition('${pc.id}','${c.key}')">${iconSvg("x")}</button></span>`;
  }).join("");

  return `<div class="livewrap">
    <div class="liverow">
      <div class="hpctl">
        <span class="stlbl">HP</span>
        <input type="number" class="hpin" id="hpin-${pc.id}" value="${pc.live.hpCur}" min="0" max="${pc.hpMax}" onchange="setHP('${pc.id}',this.value)"> / ${pc.hpMax}
        <input type="number" class="amtin" id="amt-${pc.id}" placeholder="#" min="0">
        <button class="stbtn harm" onclick="applyHP('${pc.id}',-1)">Damage</button>
        <button class="stbtn heal" onclick="applyHP('${pc.id}',1)">Heal</button>
        <span class="stlbl">Temp</span>
        <input type="number" class="hpin" value="${pc.live.hpTemp}" min="0" onchange="setTemp('${pc.id}',this.value)">
      </div>
      <div class="heroctl"><span class="stlbl">Hero</span>${hero}</div>
    </div>
    <div class="liverow">
      ${stepper("Wounded", pc.live.wounded, "wounded")}
      ${stepper("Dying", pc.live.dying, "dying")}
      ${stepper("Doomed", pc.live.doomed, "doomed")}
    </div>
    ${active ? `<div class="activeconds">${active}</div>` : ""}
    <div class="condbtns">${quick}</div>
  </div>`;
}

function withPC(id, fn) { const pc = pcById(id); if (!pc) return; fn(pc); saveState(); renderRoster(); }
function setHP(id, v) { withPC(id, (pc) => { pc.live.hpCur = clamp(Math.round(Number(v) || 0), 0, pc.hpMax); }); }
function setTemp(id, v) { withPC(id, (pc) => { pc.live.hpTemp = Math.max(0, Math.round(Number(v) || 0)); }); }
function applyHP(id, dir) {
  const amtEl = document.getElementById("amt-" + id);
  let amt = Math.abs(Math.round(Number(amtEl && amtEl.value) || 0));
  if (!amt) amt = 1;
  withPC(id, (pc) => {
    if (dir < 0) {
      let dmg = amt;
      if (pc.live.hpTemp > 0) { const absorbed = Math.min(pc.live.hpTemp, dmg); pc.live.hpTemp -= absorbed; dmg -= absorbed; }
      pc.live.hpCur = clamp(pc.live.hpCur - dmg, 0, pc.hpMax);
    } else {
      pc.live.hpCur = clamp(pc.live.hpCur + amt, 0, pc.hpMax);
    }
  });
}
function setHero(id, n) { withPC(id, (pc) => { pc.live.heroPoints = (pc.live.heroPoints === n) ? n - 1 : n; if (pc.live.heroPoints < 0) pc.live.heroPoints = 0; }); }
function bumpStage(id, key, delta) { const caps = { wounded: 3, dying: 4, doomed: 3 }; withPC(id, (pc) => { pc.live[key] = clamp((pc.live[key] || 0) + delta, 0, caps[key] || 9); }); }
function toggleCondition(id, key, valued) {
  withPC(id, (pc) => {
    const i = pc.live.conditions.findIndex((c) => c.key === key);
    if (i >= 0) pc.live.conditions.splice(i, 1);
    else pc.live.conditions.push({ key: key, value: valued ? 1 : null });
  });
}
function bumpCondition(id, key, delta) {
  withPC(id, (pc) => {
    const c = pc.live.conditions.find((x) => x.key === key); if (!c) return;
    c.value = (Number(c.value) || 0) + delta;
    if (c.value < 1) pc.live.conditions = pc.live.conditions.filter((x) => x.key !== key);
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
      <button class="btn sm" onclick="rollForParty()">${iconSvg("roll")} Roll for party</button>
    </div>
    <p class="hint">Rolls a secret <b>d20 + modifier</b> for every character at once — Perception doubles as initiative. Set a DC to colour the degrees of success (natural 20 / 1 shift one step, per PF2e).</p>
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
function pcStatMod(pc, key) {
  if (key === "perception") return pc.perception;
  if (pc.saves && key in pc.saves) return pc.saves[key];
  if (pc.skills && pc.skills[key]) return pc.skills[key].mod;
  return 0;
}
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
    const nat = d20(), mod = pcStatMod(pc, stat), total = nat + mod;
    return { id: pc.id, name: pc.name, nat: nat, mod: mod, total: total, degree: degreeOf(total, nat, dc) };
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
    return `<div class="rollrow ${r.degree != null ? DEGREE[r.degree].c : ""}">
      <span class="rname">${escapeHtml(r.name)}</span>
      <span class="rmath">${natTag} ${sign(r.mod)}</span>
      <span class="rtotal">${r.total}</span>${deg}</div>`;
  }).join("");
  box.innerHTML = head + `<div class="rolllist">${rows}</div>
    <button class="btn secondary sm" onclick="rollForParty()">Roll again</button>`;
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
    return `<div class="exprow">
      <div class="expord"><button class="ordbtn" onclick="moveMarch('${pc.id}',-1)" title="Up">${iconSvg("up")}</button>
        <span class="ordnum">${i + 1}</span>
        <button class="ordbtn" onclick="moveMarch('${pc.id}',1)" title="Down">${iconSvg("down")}</button></div>
      <div class="expname"><div class="pname">${escapeHtml(pc.name)}</div><div class="pmeta">${escapeHtml(classLine(pc))}</div></div>
      <div class="expsel"><select onchange="setActivity('${pc.id}',this.value)">${options}</select></div>
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
  if (cfg.governing === "perception") return pc.perception;
  if (pc.skills && pc.skills[cfg.governing]) return pc.skills[cfg.governing].mod;
  return null;
}
function setActivity(id, key) { library.board.assignments[id] = key; saveState(); renderExplore(); }
function moveMarch(id, delta) {
  const order = exploreOrder().map((p) => p.id);
  const i = order.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return;
  order.splice(j, 0, order.splice(i, 1)[0]);
  library.board.marchOrder = order; saveState(); renderExplore();
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
    <div class="searchbar">${iconSvg("search")}<input type="text" id="refSearch" placeholder="Search conditions & actions…" oninput="renderRefList()"></div>
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
    <button class="rmrow" title="Remove" onclick="deletePC('${pc.id}')">${iconSvg("x")}</button>
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
  const seg = ["light", "dark", "auto"].map((m) => `<button class="${mode === m ? "on" : ""}" onclick="setThemeMode('${m}')">${titleCase(m)}</button>`).join("");
  const rows = [["Background", "bg", "--bg"], ["Surface", "surface", "--surface"], ["Text", "ink", "--ink"], ["Accent", "accent", "--accent"]]
    .map(([label, key, token]) => `<div class="swatchrow"><label>${label}</label>
      <input type="color" value="${themeColorValue(token)}" oninput="setCustomColor('${key}',this.value)" aria-label="${label} colour"></div>`).join("");
  box.innerHTML = `<div class="seg">${seg}</div>${rows}
    <button class="btn secondary sm" onclick="resetTheme()">Reset colours</button>`;
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
function exportParty() {
  const payload = { characters: library.order.map((id) => { const c = Object.assign({}, library.characters[id]); delete c.id; return c; }), board: library.board };
  const code = "PF2EPARTY1:" + b64encode(JSON.stringify(payload));
  const ta = document.getElementById("backupIO"); if (ta) { ta.value = code; ta.focus(); ta.select(); }
  copyToClipboard(code, "Party code copied");
}
function importBackup() {
  let code = (document.getElementById("backupIO").value || "").trim();
  if (!code) { toast("Paste a code first"); return; }
  try {
    if (code.startsWith("PF2EPARTY1:")) {
      const payload = JSON.parse(b64decode(code.slice("PF2EPARTY1:".length)));
      (payload.characters || []).forEach((c) => {
        const id = uid(); c.id = id; c.live = c.live || freshLive(c.hpMax);
        library.characters[id] = c; library.order.push(id);
      });
      if (payload.board) library.board = Object.assign(defaultBoard(), payload.board);
      saveState(); toast(`Imported ${(payload.characters || []).length} characters`); renderAll();
    } else if (code.startsWith("PF2EP1:")) {
      const c = JSON.parse(b64decode(code.slice("PF2EP1:".length)));
      const id = uid(); c.id = id; c.live = freshLive(c.hpMax);
      library.characters[id] = c; library.order.push(id);
      saveState(); toast(`Imported ${c.name || "character"}`); renderAll();
    } else { throw new Error("bad"); }
    document.getElementById("backupIO").value = "";
  } catch (e) { alert("That code didn't work — make sure you pasted the whole thing."); }
}
function copyToClipboard(text, okMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(okMsg)).catch(() => toast("Copied to the box below"));
  else toast("Copied to the box below");
}

function emptyHint(msg) { return `<div class="empty"><p>${escapeHtml(msg)}</p><button class="btn" onclick="openMenu()">${iconSvg("plus")} Import from Pathbuilder</button></div>`; }

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
  renderHeader();
  go("roster");
  setupInstall();
}
/* The engine script is injected at the end of <body>, so every view element
   already exists — boot synchronously (no first-paint flash, and tests see a
   rendered DOM immediately). */
if (typeof document !== "undefined") boot();
