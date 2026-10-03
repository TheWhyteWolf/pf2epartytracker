# PF2e Party Tracker

A sleek, offline-first **Pathfinder 2e (Remaster) party tracker for GMs** — built
for **exploration mode and passive statistics**. Import your players' characters
straight from **Pathbuilder**, then keep the whole party's numbers a glance away:
Perception, saves, skills, senses, AC, speed, languages, and the passive DCs
(10 + modifier) you need to roll **secret checks** on their behalf.

Single self-contained `dist/index.html` — no framework, no build step to *use* it,
nothing sent anywhere. Open it from a file, host it, or install it as an app.

## Features

- **Passive stats dashboard** — a wide roster table (one row per PC); click a PC to
  expand full detail (all 16 skills + lores with passive DCs, senses, languages,
  ability mods, class DC, spellcasting DCs).
- **Secret-check roller** — roll `d20 + mod` for the whole party at once for
  Perception or any skill/save, sorted, with PF2e degrees of success against an
  optional DC. Doubles as a party initiative roller.
- **Exploration activity board** — assign each PC an exploration activity (Search,
  Scout, Avoid Notice, Investigate, Track…) and see the governing modifier, with a
  marching order.
- **Conditions that actually count** — every displayed number (AC, Perception,
  saves, skills, passive DCs, class and spell DCs) already has the penalties from
  a PC's active conditions applied, following PF2e's stacking rule that only the
  worst penalty of each type counts. Hover a red figure for the breakdown.
- **Live session tracking** — current/temp HP, conditions, hero points, and
  wounded/dying/doomed, per PC. Dropping to 0 HP sets dying to 1 + wounded,
  healing off it adds a wound, Doomed lowers the threshold you die at, and
  Drained reduces maximum HP.
- **Rules reference** — condition and action text derived from the Foundry pf2e data.

## Import from Pathbuilder

In Pathbuilder 2e: **Menu → Export → Export JSON**. You get a numeric code and a
`https://pathbuilder2e.com/json.php?id=…` link.

- **By code** — paste the export id and the tracker fetches it. (Pathbuilder's
  endpoint may block cross-site fetches in some browsers.)
- **By JSON (always works, offline)** — copy the exported JSON and paste it in.

Everything is stored **only in your browser** (`localStorage`). Export a PC or the
whole party to a portable code for backup or to move it to another device.

## Run it

```sh
python3 tools/build.py        # assemble dist/index.html
# then either:
open dist/index.html          # straight from the file, fully offline
npx pf2e-party-tracker        # serve at http://localhost:8725 and open the browser
```

## Rebuild the rules reference (optional)

The bundled condition/action text is generated from the open-source Foundry pf2e
system data:

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/foundryvtt/pf2e.git pf2e-data
cd pf2e-data && git sparse-checkout set packs/pf2e/conditions packs/pf2e/actions && cd ..
python3 tools/build_reference.py --src pf2e-data/packs/pf2e --out data/reference.generated.js
```

## Tests

```sh
npm run check                 # build, then run the suite
node tools/test.mjs           # jsdom; asserts the Pathbuilder parser against a real fixture
```

The suite covers the Pathbuilder parser, the condition-penalty maths, death and
dying, the backup codes (including the exploration board surviving a round-trip),
and that no generated markup interpolates a value into an event-handler
attribute. CI runs it on every push and pull request, the Pages deploy is gated
on it, and `dist/` is checked for drift against `src/`.

## Licensing

Application code is MIT (see [`LICENSE`](./LICENSE)). Bundled Pathfinder condition
and action text is Paizo content under the ORC/OGL licenses — see
[`notice.md`](./notice.md). This is an unofficial fan tool, not affiliated with
Paizo or with Pathbuilder.
