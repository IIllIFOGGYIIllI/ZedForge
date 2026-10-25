# ZedForge

**Forge Your Survival Experience.** Unofficial DayZ console configuration toolkit for PlayStation and Xbox.

## v0.2.0 Alpha — working tools

The project is a **static website / installable PWA**. No Discord bot, Railway, account, or backend is required.

- Import XML, JSON or ZIP archives directly in the browser.
- All file contents remain on the user's device; **no server-side uploads**.
- Detect and browse types.xml classnames, with search and best-effort category grouping.
- Bulk loot boosts using **custom multipliers** or **exact nominal/min values**, optionally including disabled items.
- Preview all planned boosts before applying; stop invalid min > nominal results.
- **Individual item editor** for nominal, min, lifetime, restock, quantmin, quantmax and cost.
- **Undo/redo and original-file recovery** (up to eight undo snapshots per file).
- **IndexedDB workspace persistence** across browser refreshes when storage is available; displays storage status.
- **Change Review** compares edited configuration against the original imported version.
- XML and JSON syntax validation, duplicate classname reporting and basic numeric checks.
- ZIP export of **modified files only** or full import, retaining original relative paths.
- ZIP processing via vendored JSZip 3.10.2 so it can work **offline once installed**.
- Four themes: Obsidian, Tactical Olive, Midnight Blue, Arctic Light.
- Mobile-responsive interface, PWA shell, service worker, and browser installability.

## Open the live website

https://IIllIFOGGYIIllI.github.io/ZedForge/

## Local development

```sh
python -m http.server 8000
# open http://localhost:8000
node tests/run-tests.mjs
```

No build pipeline or npm dependencies are needed for runtime or unit tests.

## How to use

1. Open File Manager / Overview; import a `types.xml`, JSON file, or configuration ZIP.
2. In Loot Booster, choose your `types.xml`, multiplier vs exact target, filter and field scope.
3. Preview proposed values and confirm only after checking them. A second boost compounds the already-edited file.
4. In Item Editor, search for a classname, edit the numeric fields and save.
5. In Change Review, inspect differences and undo / redo if needed.
6. Use Validation, then export changed files as a ZIP or export an individual XML.

## Safety and restrictions

- A local browser workspace can still be wiped by clearing site data, private browsing or browser storage quotas. **Export important edits regularly.**
- Unrecognised category filters are best-effort. Always review proposed change lists.
- `quantmin` / `quantmax` allow -1; normal nominal/min/seconds values require nonnegative integers.
- Individual edits change only **existing** numeric fields; ZedForge does not invent unsupported XML tags.
- Numeric edits preserve all unrelated XML and original whitespace/comments wherever matching is unambiguous.
- XML must be well-formed before editing/export. Validation is **not** a game-engine or classname compatibility guarantee.
- DayZ population values can affect performance and economy balance; large boosts are not automatically safe for every server.
- ZIP input: max 40 MB compressed, 60 MB uncompressed relevant entries, 8 MB per XML/JSON file, max 500 relevant configuration entries.
- XML is currently read and written as UTF-8 text; unsupported encodings are not preserved.
- Imported configurations are **not** pushed to Nitrado, and ZedForge cannot restart or reconfigure live servers.
- App is not affiliated with Bohemia Interactive, Nitrado or console manufacturers.

## Licensing

The vendored JSZip library is from the official [JSZip repository](https://github.com/Stuk/jszip) and is used under its MIT license. See `vendor/JSZIP-LICENSE.md`.

## Roadmap

- More DayZ XML editors (attachments, events, vehicle spawns).
- Accurate versioned classname/reference datasets with map support.
- More granular backups, server profiles, profiles export/import, diff filtering and edit history.
- Map editing, compatible desktop packaging and optional server integration.

This repository remains under development; test exports before using them on live servers.
