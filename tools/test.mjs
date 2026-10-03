import { JSDOM, VirtualConsole } from "jsdom";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");

let pass = 0, fail = 0;
function ok(cond, msg) { (cond ? pass++ : fail++); console.log((cond ? "  ✓ " : "  ✗ FAIL ") + msg); }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(e.message));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  virtualConsole: vc,
  url: "https://example.org/",
  beforeParse(window) { window.scrollTo = () => {}; window.confirm = () => true; window.alert = () => {}; },
});
const w = dom.window;
const d = w.document;
const ev = (expr) => w.eval(expr);

/* The real L2 Investigator export (tools/fixtures/investigator.json), inlined so
   the test is self-contained. Every derived value below is hand-computed. */
const FIX = {
  success: true,
  build: {
    name: 'Perengis "Perry"  Xvant', class: "Investigator", level: 2,
    ancestry: "Half-Elf", heritage: "", background: "Criminal", size: 2, keyability: "int",
    languages: ["Common", "Dwarven", "Elven", "Goblin", "Orcish", "Sylvan"],
    abilities: { str: 10, dex: 14, con: 10, int: 18, wis: 14, cha: 12 },
    attributes: { ancestryhp: 8, classhp: 8, bonushp: 0, bonushpPerLevel: 0, speed: 25, speedBonus: 0 },
    proficiencies: {
      perception: 4, fortitude: 2, reflex: 4, will: 4, classDC: 2,
      acrobatics: 2, arcana: 2, athletics: 0, crafting: 0, deception: 2, diplomacy: 2,
      intimidation: 2, medicine: 4, nature: 0, occultism: 2, performance: 0, religion: 2,
      society: 2, stealth: 2, survival: 0, thievery: 2,
    },
    acTotal: { acProfBonus: 4, acAbilityBonus: 2, acItemBonus: 1, acTotal: 17 },
    lores: [["Heraldry", 2], ["Osirion", 0]],
    specials: ["Low-Light Vision", "Devise a Stratagem", "Half-Elf"],
    spellCasters: [],
  },
};

console.log("\n# load / no script errors");
ok(errors.length === 0, "no jsdom script errors" + (errors.length ? ": " + errors[0] : ""));
ok(!html.includes("/*__INJECT_"), "all build markers were replaced");
ok(ev("pcs().length") === 0, "starts with an empty party");
ok(!d.getElementById("view-roster").classList.contains("hide"), "lands on the roster view");
ok(/No characters yet/.test(d.getElementById("view-roster").innerHTML), "roster shows the empty state");

console.log("\n# arithmetic helpers");
eq(w.abilityMod(18), 4, "abilityMod(18)");
eq(w.abilityMod(10), 0, "abilityMod(10)");
eq(w.abilityMod(7), -2, "abilityMod(7)");
eq(w.profBonus(0, 5), 0, "profBonus untrained adds neither rank nor level");
eq(w.profBonus(2, 1), 3, "profBonus trained @L1 = 2+1");
eq(w.profBonus(8, 20), 28, "profBonus legendary @L20 = 8+20");

console.log("\n# parsePathbuilder — derived stats vs the real fixture");
const pc = w.parsePathbuilder(FIX);
eq(pc.name, 'Perengis "Perry" Xvant', "name (whitespace collapsed)");
eq(pc.level, 2, "level");
eq(pc.mods.int, 4, "INT mod +4");
eq(pc.mods.dex, 2, "DEX mod +2");
eq(pc.mods.con, 0, "CON mod 0");
eq(pc.perception, 8, "Perception +8 (wis+2, expert 4+2)");
eq(pc.perceptionPassive, 18, "Perception passive 18");
eq(pc.saves.fortitude, 4, "Fort +4");
eq(pc.saves.reflex, 8, "Ref +8");
eq(pc.saves.will, 8, "Will +8");
eq(pc.ac, 17, "AC 17 (uses acTotal.acTotal)");
eq(pc.classDC, 18, "Class DC 18 (10 + prof 6 + int 4) — no double level");
eq(pc.hpMax, 24, "HP max 24 (8 + (8+0)*2)");
eq(pc.speed, 25, "Speed 25");
eq(pc.skills.athletics.mod, 0, "Athletics +0 (untrained, str 0)");
eq(pc.skills.arcana.mod, 8, "Arcana +8 (int 4, trained 2+2)");
eq(pc.skills.medicine.mod, 8, "Medicine +8 (wis 2, expert 4+2)");
eq(pc.skills.deception.mod, 5, "Deception +5 (cha 1, trained 2+2)");
eq(pc.skills.nature.mod, 2, "Nature +2 (untrained, wis 2)");
eq(pc.skills.arcana.passive, 18, "Arcana passive 18");
eq(pc.lores.length, 2, "two lores");
eq(pc.lores[0].name + " " + pc.lores[0].mod, "Heraldry 8", "Heraldry Lore +8 (int 4, trained 2+2)");
eq(pc.lores[1].mod, 4, "Osirion Lore +4 (untrained, int 4)");
eq(pc.senses.join(","), "Low-Light Vision", "senses picks Low-Light Vision out of specials");
eq(pc.languages.length, 6, "6 languages");
eq(pc.spellcasting.length, 0, "no spellcasting");

console.log("\n# parsePathbuilder — synthetic spellcaster DC/attack");
const caster = w.parsePathbuilder({ build: {
  name: "Sorc", level: 5, keyability: "cha",
  abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 18 },
  attributes: { ancestryhp: 6, classhp: 6, bonushp: 0, bonushpPerLevel: 0, speed: 25, speedBonus: 0 },
  proficiencies: { perception: 2, fortitude: 2, reflex: 2, will: 4, classDC: 0 },
  acTotal: { acTotal: 20 }, lores: [],
  spellCasters: [{ name: "Arcane", magicTradition: "arcane", ability: "cha", proficiency: 4, focusPoints: 1 }],
} });
eq(caster.spellcasting[0].dc, 10 + (4 + 5) + 4, "spell DC = 10 + prof(4,5) + cha 4 = 23");
eq(caster.spellcasting[0].attack, (4 + 5) + 4, "spell attack = prof(4,5) + cha 4 = +13");
eq(caster.focusPool, 1, "focus pool summed");
eq(caster.hpMax, 6 + (6 + 1) * 5, "HP with positive Con: 6 + (6+1)*5 = 41");

console.log("\n# validation");
let threw = false; try { w.parsePathbuilder({ build: { name: "x" } }); } catch (e) { threw = true; }
ok(threw, "missing core fields throws");

console.log("\n# commitImport — add, then re-import preserves live state & clamps HP");
w.commitImport(FIX, "102154");
eq(ev("pcs().length"), 1, "one character after import");
const id = ev("pcs()[0].id");
ev(`library.characters['${id}'].live.hpCur = 5; library.characters['${id}'].live.conditions=[{key:'frightened',value:2}]; library.characters['${id}'].live.heroPoints=3;`);
const r2 = w.commitImport(FIX, "102154");
ok(r2.updated === true, "re-import by pbId updates in place (no duplicate)");
eq(ev("pcs().length"), 1, "still one character (matched, not duplicated)");
eq(ev(`library.characters['${id}'].live.hpCur`), 5, "live HP preserved across re-import");
eq(ev(`library.characters['${id}'].live.conditions[0].value`), 2, "conditions preserved across re-import");

console.log("\n# roller — degrees of success");
eq(w.degreeOf(25, 10, 15), 3, "total >= DC+10 -> crit success");
eq(w.degreeOf(15, 10, 15), 2, "total >= DC -> success");
eq(w.degreeOf(14, 10, 15), 1, "below DC -> failure");
eq(w.degreeOf(5, 10, 15), 0, "total <= DC-10 -> crit failure");
eq(w.degreeOf(14, 20, 15), 2, "natural 20 shifts failure up to success");
eq(w.degreeOf(15, 1, 15), 1, "natural 1 shifts success down to failure");
eq(w.degreeOf(30, 10, ""), null, "no DC -> no degree");

console.log("\n# roller — rolls once per PC, sorted, uses stored mods");
w.go("roll");
const realRandom = w.Math.random; let seq = [0.0, 0.95], k = 0;
w.Math.random = () => seq[(k++) % seq.length];
d.getElementById("rollStat").value = "perception";
d.getElementById("rollDC").value = "";
w.rollForParty();
eq(ev("_lastRoll.rolls.length"), 1, "one roll for the one PC");
w.Math.random = realRandom;

console.log("\n# live tracking — damage soaks temp HP first, heal caps at max");
ev(`library.activeId='${id}';`);
ev(`library.characters['${id}'].live.hpCur=24; library.characters['${id}'].live.hpTemp=3;`);
w.go("roster");
w.setHP(id, 24);
ev(`(function(){var a=document.getElementById('amt-${id}'); if(a) a.value=5;})()`);
w.applyHP(id, -1);
eq(ev(`library.characters['${id}'].live.hpTemp`), 0, "temp HP absorbed first (3 of 5)");
eq(ev(`library.characters['${id}'].live.hpCur`), 22, "remaining 2 damage hits current (24 -> 22)");
w.applyHP(id, 1);
ev(`(function(){var a=document.getElementById('amt-${id}'); if(a) a.value=100;})()`);
w.applyHP(id, 1);
eq(ev(`library.characters['${id}'].live.hpCur`), 24, "heal caps at max HP");

console.log("\n# condition penalties — typed stacking, per the Foundry condition rules");
const cpc = w.parsePathbuilder(FIX);
const setConds = (list) => { cpc.live = { hpCur: cpc.hpMax, hpTemp: 0, heroPoints: 1, wounded: 0, dying: 0, doomed: 0, conditions: list }; };
setConds([]);
eq(w.effMod(cpc, "stealth"), 6, "no conditions: Stealth is the plain modifier");
setConds([{ key: "frightened", value: 2 }]);
eq(w.effMod(cpc, "stealth"), 4, "Frightened 2 is a -2 status penalty to every check");
eq(w.effStat(cpc, "ac").value, 15, "Frightened 2 also lowers AC (a DC) from 17");
setConds([{ key: "frightened", value: 2 }, { key: "sickened", value: 3 }]);
eq(w.effMod(cpc, "stealth"), 3, "two status penalties do not stack — only the worst (-3) applies");
setConds([{ key: "frightened", value: 2 }, { key: "off-guard", value: null }]);
eq(w.effStat(cpc, "ac").value, 13, "status -2 and circumstance -2 are different types, so they add");
eq(w.effMod(cpc, "stealth"), 4, "off-guard touches AC only, not skills");
setConds([{ key: "clumsy", value: 2 }]);
eq(w.effMod(cpc, "stealth"), 4, "Clumsy 2 hits dex-based Stealth");
eq(w.effMod(cpc, "arcana"), 8, "Clumsy 2 leaves int-based Arcana alone");
eq(w.effMod(cpc, "reflex"), 6, "Clumsy 2 hits the Reflex save");
eq(w.effStat(cpc, "ac").value, 15, "Clumsy 2 hits AC");
setConds([{ key: "stupefied", value: 3 }]);
eq(w.effMod(cpc, "perception"), 5, "Stupefied 3 hits wis-based Perception");
eq(w.effMod(cpc, "will"), 5, "Stupefied 3 hits the Will save");
eq(w.effMod(cpc, "fortitude"), 4, "Stupefied 3 leaves the con-based Fortitude save alone");
setConds([{ key: "enfeebled", value: 1 }]);
eq(w.effMod(cpc, "athletics"), -1, "Enfeebled 1 hits str-based Athletics");
setConds([{ key: "drained", value: 1 }]);
eq(w.effMod(cpc, "fortitude"), 3, "Drained 1 hits the con-based Fortitude save");
eq(w.effMaxHP(cpc), 24 - 2, "Drained 1 lowers maximum HP by level x value");
setConds([{ key: "fatigued", value: null }]);
eq(w.effStat(cpc, "ac").value, 16, "Fatigued is -1 to AC");
eq(w.effMod(cpc, "will"), 7, "Fatigued is -1 to saves");
eq(w.effMod(cpc, "stealth"), 6, "Fatigued does not touch skills");
setConds([{ key: "blinded", value: null }]);
eq(w.effMod(cpc, "perception"), 4, "Blinded is -4 to Perception");
setConds([{ key: "prone", value: null }, { key: "grabbed", value: null }]);
eq(w.effStat(cpc, "ac").value, 15, "prone + grabbed are both off-guard: one -2 circumstance, not two");
setConds([]);
cpc.live.dying = 1;
eq(w.effStat(cpc, "ac").value, 17 - 4 - 2, "dying implies unconscious: -4 status and off-guard on AC");
eq(w.effMod(cpc, "reflex"), 8 - 4, "dying implies unconscious: -4 status to Reflex");
ok(w.effStat(cpc, "perception").note.indexOf("dying") >= 0, "the breakdown names the implied condition");
cpc.live.dying = 0;
setConds([{ key: "frightened", value: 2 }]);
ok(w.effStat(cpc, "stealth").note.indexOf("Frightened 2") >= 0, "the breakdown names the condition and its value");

console.log("\n# death and dying");
const live = () => ev(`library.characters['${id}'].live`);
ev(`library.characters['${id}'].live.dying=0; library.characters['${id}'].live.wounded=0; library.characters['${id}'].live.hpCur=10;`);
w.setHP(id, 0);
eq(live().dying, 1, "dropping to 0 HP sets dying 1");
w.setHP(id, 4);
eq(live().dying, 0, "regaining HP clears dying");
eq(live().wounded, 1, "...and leaves you wounded 1");
w.setHP(id, 0);
eq(live().dying, 2, "dropping again while wounded 1 sets dying 2");
eq(w.maxDying(w.pcById(id)), 4, "you die at dying 4 when not doomed");
ev(`library.characters['${id}'].live.doomed=2;`);
eq(w.maxDying(w.pcById(id)), 2, "Doomed 2 means you die at dying 2");
for (let i = 0; i < 6; i++) w.bumpStage(id, "dying", 1);
eq(live().dying, 2, "dying is capped by the doomed-adjusted threshold");
ok(w.isDead(w.pcById(id)), "dying at the threshold reads as dead");
ev(`library.characters['${id}'].live.doomed=0; library.characters['${id}'].live.dying=0; library.characters['${id}'].live.wounded=0;`);
w.setHP(id, 24);

console.log("\n# generated markup carries no inline handlers, and escapes attributes");
const genHandlers = html.match(/on(?:click|change|input)=\\?"/g) || [];
ok(!/`[^`]*on(?:click|change|input)="\$\{/.test(html), "no template literal interpolates into an on* attribute");
ev(`library.characters['${id}'].live.conditions=[{key:"x'),alert(1),('", value:2}];`);
const injected = ev(`liveTrackingHTML(library.characters['${id}'])`);
ok(injected.indexOf("alert(1)") < 0 || injected.indexOf("&#39;") >= 0, "a quote in a condition key is escaped, not executed");
ok(!/data-key="[^"]*'[^"]*"/.test(injected), "no raw single quote survives into an attribute value");
eq(w.escapeHtml("a'b\"c<d>e&f"), "a&#39;b&quot;c&lt;d&gt;e&amp;f", "escapeHtml covers the single quote");
ev(`library.characters['${id}'].live.conditions=[];`);

console.log("\n# a partial character cannot break a render");
// injected raw, bypassing normalize — the last-resort guard has to hold
ev(`library.characters['broken']={id:'broken',name:'Broken'}; library.order.push('broken');`);
let renderThrew = false;
try { w.render("roster"); } catch (e) { renderThrew = true; }
ok(!renderThrew, "rendering a roster containing a partial character does not throw");
ok(/couldn't be displayed/.test(d.getElementById("view-roster").innerHTML), "it falls back to a recovery panel instead of a blank view");
ok(/PF2EPARTY1:/.test(d.getElementById("failureIO").value), "the recovery panel still offers a backup code");
// and on the normal path the record is repaired, so it simply renders
ev(`library=normalizeLib(library);`);
const fixed = ev(`library.characters['broken']`);
eq(typeof fixed.saves.fortitude, "number", "normalize back-fills the saves");
eq(Object.keys(fixed.skills).length, 16, "normalize back-fills all 16 skills");
ok(Array.isArray(fixed.lores) && Array.isArray(fixed.languages), "normalize back-fills the list fields");
w.render("roster");
ok(/Broken/.test(d.getElementById("view-roster").innerHTML), "the repaired character renders in the roster");
ev(`delete library.characters['broken']; library.order=library.order.filter(x=>x!=='broken'); library=normalizeLib(library);`);

console.log("\n# normalize drops duplicates and dangling references");
ev(`library.order.push(library.order[0]); library.board.assignments['ghost']='search'; library.board.marchOrder.push('ghost'); library=normalizeLib(library);`);
eq(ev("library.order.length"), ev("new Set(library.order).size"), "duplicate ids are removed from the order");
eq(ev("library.board.assignments['ghost']"), undefined, "assignments for missing characters are dropped");
eq(ev("library.board.marchOrder.indexOf('ghost')"), -1, "march order entries for missing characters are dropped");

console.log("\n# backup codes round-trip, including the exploration board");
w.commitImport({ build: Object.assign({}, FIX.build, { name: "Second PC" }) }, null);
const [idA, idB] = ev("pcs().map(p=>p.id)");
w.setActivity(idA, "search");
w.setActivity(idB, "scout");
w.moveMarch(idB, -1);
const orderNames = ev("exploreOrder().map(p=>p.name)");
w.exportParty();
const code = d.getElementById("backupIO").value;
ok(code.startsWith("PF2EPARTY1:"), "party export produces a PF2EPARTY1 code");

// a fresh library, as if the code were pasted on another device
ev(`library=normalizeLib({characters:{},order:[],activeId:null});`);
d.getElementById("backupIO").value = code;
w.importBackup();
eq(ev("pcs().length"), 2, "importing the party code restores both characters");
eq(JSON.stringify(ev("exploreOrder().map(p=>p.name)")), JSON.stringify(orderNames), "marching order survives the round-trip");
eq(JSON.stringify(ev("pcs().map(p=>library.board.assignments[p.id]||null)").sort()),
   JSON.stringify(["scout", "search"].sort()), "activity assignments are remapped to the new ids");

console.log("\n# re-importing a code updates instead of duplicating");
d.getElementById("backupIO").value = code;
w.importBackup();
eq(ev("pcs().length"), 2, "importing the same party code twice does not duplicate the party");
ev(`library.characters[pcs()[0].id].live.hpCur = 3;`);
d.getElementById("backupIO").value = code;
w.importBackup();
eq(ev("pcs().length"), 2, "still two characters after a third import");
d.getElementById("backupIO").value = "not a real code";
w.importBackup();
ok(/didn't work/.test(d.getElementById("toast").textContent), "a bad code reports through the toast, not a modal alert");

console.log("\n# a click is dispatched from the data-act attributes");
ev(`library.activeId = pcs()[0].id;`);
w.render("roster");
const row = d.querySelector('tr.rrow[data-act="toggleRosterRow"]');
ok(!!row, "roster rows carry a data-act handler");
eq(row.getAttribute("role"), "button", "roster rows are exposed as buttons");
eq(row.getAttribute("tabindex"), "0", "roster rows are reachable by keyboard");
const heal = d.querySelector('button[data-act="applyHP"][data-val="1"]');
ok(!!heal, "the Heal button carries a data-act handler");
const beforeHeal = ev(`library.characters['${ev("pcs()[0].id")}'].live.hpCur`);
heal.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
ok(ev(`library.characters['${ev("pcs()[0].id")}'].live.hpCur`) >= beforeHeal, "clicking it reaches applyHP through the delegated listener");
const openRow = d.querySelector('tr.rrow[aria-expanded="true"]');
ok(!!openRow, "the open row reports aria-expanded=true");
openRow.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
ok(!d.querySelector('tr.rrow[aria-expanded="true"]'), "Enter on a row toggles it closed");

console.log("\n# no emoji in the shipped UI text");
ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html.replace(/[✓✗]/g, "")), "no stray emoji in dist");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
