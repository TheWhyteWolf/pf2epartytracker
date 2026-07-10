# Third-Party Notices & Attribution

**pf2e-party-tracker**

This file records the licensing of the two distinct kinds of material in this
package: the application **code**, and the Pathfinder **rules text** it bundles
(condition and action descriptions). They are covered by different licenses and
the distinction below is intentional.

---

## 1. Application code

All original source code in this package is released under the **MIT License**.
See the [`LICENSE`](./LICENSE) file for the full text.

```
Copyright (c) 2026 Whyte Erminae
```

The MIT License covers only the code authored for this project. It does **not**
cover the Pathfinder game content described in section 2, which carries its own
license and notice. The character **numbers** shown by this app are computed from
data you import from your own Pathbuilder builds; no character data is bundled.

---

## 2. Pathfinder rules content (ORC License)

The bundled reference data consists of the **rules expressions of Pathfinder
Second Edition conditions and actions** — their names and functional effect text.
Under the Open RPG Creative License this is **Licensed Material** (the copyrighted
expression of game mechanics), used here under that license. It originates with
**Paizo Inc.** and is derived from the open-source [Foundry VTT `pf2e`
system](https://github.com/foundryvtt/pf2e) data.

### ORC Notice

This product is licensed under the ORC License located at the Library of Congress
at TX 9-307-067 and available online at various locations including
paizo.com/orclicense, azoralaw.com/orclicense, and others. All warranties are
disclaimed as set forth therein.

### Attribution

This product is based on the following Licensed Material:

Pathfinder Player Core © 2023 Paizo Inc., Designed by Logan Bonner, Jason
Bulmahn, Stephen Radney-MacFarland, and Mark Seifter.

Pathfinder Player Core 2 © 2024 Paizo Inc.

Pathfinder GM Core © 2023 Paizo Inc., Designed by Logan Bonner and Mark Seifter.

> NOTE — The precise list of source books is generated into `GENERATED_REF_META`
> in `data/reference.generated.js` from the licenses recorded in the Foundry pf2e
> data. Re-sync this section whenever the reference data is rebuilt
> (`npm run build:ref`).

### Reserved Material

Reserved Material elements are excluded from this product. To avoid confusion,
such items include all trademarks, registered trademarks, and proper nouns,
artwork, dialogue, organizations, plots, and storylines. Where a rule's mechanics
are included, any such Reserved Material has been omitted or genericized.

### Crediting this work downstream

pf2e-party-tracker © 2026 Whyte Erminae.

---

## 3. Compatibility / trademark notice

Pathfinder and all associated marks and logos are trademarks of Paizo Inc.
This package is an independent work, is **not** published, endorsed, sponsored,
or affiliated with Paizo Inc., and no such association is implied. Any reference
to Pathfinder is made under nominative fair use solely to identify the game
system with which this material is compatible. "Pathbuilder" is a third-party
tool by Redrazors; this project is not affiliated with it and only reads the JSON
you choose to export.
