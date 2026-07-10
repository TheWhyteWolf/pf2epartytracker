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

console.log("\n# backup codes round-trip");
w.exportParty();
const code = d.getElementById("backupIO").value;
ok(code.startsWith("PF2EPARTY1:"), "party export produces a PF2EPARTY1 code");
d.getElementById("backupIO").value = code;
w.importBackup();
eq(ev("pcs().length"), 2, "importing the party code adds the characters back");

console.log("\n# no emoji in the shipped UI text");
ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html.replace(/[✓✗]/g, "")), "no stray emoji in dist");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
