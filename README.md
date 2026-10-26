# ZedForge

**Forge Your Survival Experience.** A local-first DayZ PlayStation and Xbox console server configuration toolkit, installable as a web application.

Website: https://IIllIFOGGYIIllI.github.io/ZedForge/

## v0.3.0 Alpha

### Current tools

- **File Manager:** Import XML/JSON/ZIP, inspect files, restore originals, download single XML files or only changed configurations as ZIPs.
- **Loot Booster:** Search and filter `types.xml`, multiply populations or set exact values, select specific entries, exclude classnames, preview all affected entries, and undo changes.
- **Individual Item Editor:** Edit existing nominal, min, lifetime, restock, quantmin, quantmax and cost values. Every field has an explanation.
- **Spawnable Studio (new):** Import `cfgspawnabletypes.xml` and edit existing attachment group chances, individual candidate chances, cargo group/item chances, and damage min/max. Add pristine damage for a single item, or use deliberate bulk pristine / group-chance actions.
- **Events Studio (new):** Import `events.xml` and edit event population and lifecycle fields plus existing child min/max and lootmin/lootmax. Search and filter vehicles, animals, infected and static events; optionally multiply vehicle event populations.
- **Change Review & Validation:** Original-versus-edited comparisons, XML/JSON parse checks, duplicate and numeric checks, spawnable chance/damage validation, and event child/range checks.
- **Workspace:** IndexedDB local storage when supported, undo/redo snapshots, four themes, offline PWA, locally bundled JSZip.

### Import/export workflow

1. Open the website, upload individual XML/JSON files or a ZIP. Multiple configurations can be imported together.
2. Select the appropriate studio. Editors work against **the user's imported files**, not generic replacement templates.
3. Review proposed changes. Use Undo, Change Review and Validation before exporting.
4. Download the edited single file or choose **Export changed ZIP** to preserve the relative paths of only modified files.

### Safety

- This project is a public **alpha**, not a substitute for backing up your server before deployment.
- Files are processed entirely on-device. They are not uploaded to a ZedForge server.
- Reloads typically restore the workspace via IndexedDB, but private browsing, browser storage clearing, or quota limits can remove it. Export regularly.
- The XML editors change existing targeted text in place and preserve unrelated comments, child ordering and formatting wherever supported.
- An editor **does not add unsupported tags** automatically. The explicit Add pristine damage action is an exception.
- The current category classification is best-effort. Verify selections, especially for boosted items.
- Vehicle populations can be limited by `cfgeventspawns.xml` and the game's economy logic. This release does not generate spawn coordinates.
- Validation does not prove every classname is supported by every DayZ map or game version.
- Imported files should be UTF-8 XML/JSON, 8 MB per configuration file. ZIP imports: 40 MB compressed maximum and 60 MB relevant uncompressed payload.
- No Nitrado integration or automated live server changes.
- The application is unofficial and not affiliated with Bohemia Interactive, console manufacturers or Nitrado.

## Local development

From this repository:

```sh
python -m http.server 8000
node tests/run-tests.mjs
node tests/studios-tests.mjs
```

Open http://localhost:8000. JavaScript and ZIP processing have no external runtime CDN dependencies.

## Nasdara Map Lab v0.4.0

The isolated [Nasdara Map Lab](https://IIllIFOGGYIIllI.github.io/ZedForge/map-lab/) now supports optional local high-resolution tile ZIPs, imported towns/POIs and tree points, search, visual layer toggles, and landmark-based coordinate alignment checks. The standalone [tile pack builder](tools/build_nasdara_tiles.py) converts user-supplied imagery into multiresolution packs; it does not provide or redistribute game assets. The original World War Z website remains unchanged.

## Experimental satellite mapping

[Open Nasdara Map Lab](https://IIllIFOGGYIIllI.github.io/ZedForge/map-lab/) for a detailed terrain viewer with locally loaded Nasdara satellite imagery, direction-aware short road-gap repairs, brighter junctions, optional vegetation highlighting, spatially indexed buildings, coordinate measuring and marker management. No World War Z source files are modified. See [Map Lab docs](map-lab/README.md).

## Next milestones

More advanced `cfgeventspawns.xml` coordinates, map-assisted editing, vehicle attachment presets, multi-server profiles, and versioned classname reference data.

## Dependencies and licensing

Uses local [JSZip](https://github.com/Stuk/jszip) 3.10.2 under the MIT license; see `vendor/JSZIP-LICENSE.md`.
