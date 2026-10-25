# ZedForge

**Forge Your Survival Experience.** A browser-based configuration toolkit for DayZ console community servers.

> **v0.1.0 Alpha — private development build.** Not affiliated with Bohemia Interactive or Nitrado.

## Working features

- Responsive dashboard, four themes, installable web-app foundation.
- Import single or multiple XML / JSON files; import DayZ configuration ZIPs.
- Keep original source text and file paths in memory; no accounts or server-side uploads.
- Browse and search entries in an imported `types.xml`.
- Apply selectable 150–1000% quantity multipliers to nominal, minimum, or both, with a confirmation preview.
- Preserve unrelated XML text, including comments and original ordering, using targeted numerical replacements.
- Select specific classnames, filter by category (best-effort classification), and revert to the imported original.
- Validate XML/JSON syntax, repeated classnames, numeric fields, and min > nominal.
- Export a selected XML, all files in a ZIP, or **modified files only** in a ZIP.

## Start locally

Run a static server in the repository directory:

```sh
python -m http.server 8000
```

Then visit `http://localhost:8000`. The XML editing features need no backend. **ZIP import/export currently uses JSZip 3.10.1 loaded from a public CDN**, so a first-time network connection is needed for ZIP tools. Offline ZIP use is a planned improvement.

## Safety and limitations

- Files remain in browser memory and **are lost on reload** unless exported. Unsaved changes trigger a leave-page warning.
- The editor modifies only `nominal` and `min` numeric values of recognised `types.xml` records. It never silently rewrites the whole XML document.
- Category classification is heuristic; verify selections before applying category-wide changes.
- The preview currently displays up to 100 changed entries; the confirmation count includes all.
- Duplicate classnames are reported. They are not automatically merged.
- Validation covers syntax and limited structural sanity checks, **not official classname existence or gameplay behaviour**.
- ZIP input accepts XML/JSON files up to 8 MB each, up to 500 relevant entries and archives up to 40 MB. The ZIP reader library is currently externally hosted.
- No Nitrado integration, no automatic server deployment, no gameplay promises.
- Supported core XML editing is applicable to PlayStation and Xbox console server configurations.

## Roadmap

1. Bundle ZIP processing locally for full offline support, improve preserving all supported file encodings.
2. Editing of attachments and events, more robust category support, inline item editing.
3. Profiles, local version history and comprehensive DayZ compatibility reference datasets.
4. Map editor, vehicle tools, and optional external hosting integrations.
5. Public release after real-world verification against private World War Z test configurations.

## Design

Obsidian default theme with Tactical Olive, Midnight Blue and Arctic Light alternatives.

## Privacy

There is no application backend. Imports, edits and downloads are processed in the browser. A CDN script is currently requested for ZIP operations; it does not receive uploaded configuration files from application code.
