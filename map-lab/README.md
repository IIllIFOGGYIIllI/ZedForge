# Nasdara Map Lab — detailed terrain viewer (v0.3.3)

**[Launch Map Lab](https://IIllIFOGGYIIllI.github.io/ZedForge/map-lab/)**

This is a separate ZedForge satellite-map prototype. It has **not modified or replaced the World War Z website map**.

## Stability update — road flicker fix

The previous renderer drew every road segment on the visible canvas on each pan/zoom frame with a desynchronized canvas context. On real maps, that could show the road overlay flashing or disappearing intermittently. The renderer now:

- Uses a **synchronized visible canvas**, so partial drawings are not exposed.
- Composites a **fully rendered 3072px cached road layer** when zoomed out.
- Uses a **64 × 64 road spatial index** and draws only viewport-intersecting segments at close zoom.
- Reduces the stark white road styling at overview zoom and preserves separate paved/dirt filters.
- Shows a count of building model pictures actually drawn at close zoom, not just files loaded.

Visual verification on the user's machine remains important. This update was triggered by the road flickering visible in the recorded 26 October test.

## Major v0.3.3 map improvements

- Import **real native paved and dirt roads** from the locally supplied `nasdara.roads` binary (47,236 segments in the publicly documented reference dataset).
- Import **real native structure footprints** from the locally supplied `nasdara.objects` binary (295,195 placements in the publicly documented reference dataset).
- Spatial-indexed building rendering: show footprints at high zoom, cull objects far outside the viewport, and cap per-frame drawing cost.
- **Optional genuine top-down building artwork:** load a ZIP containing `0000.png`, `0001.png`, etc. (or select multiple numbered PNG files) matching the `.objects` model indices. At close zoom the viewer overlays the real model images through the source affine transforms. Images are decoded lazily with a 72 MiB decoded-picture cache instead of loading thousands simultaneously.
- Independently enable paved roads, dirt roads, building outlines, player markers, event positions and the coordinate grid.
- Switch satellite rendering between Natural, Enhanced Detail and Darkened Tactical; adjust vector overlay opacity.
- Overview navigator in the upper-right, with viewport rectangle and click-to-center.
- Measure distance between two chosen map points with real X/Z metre distances.
- Full-width map focus mode and detailed ruler / scale bar.
- Image import, local autosave, offline cached source, marker management, coordinate search, labeled marker CSV, and drag-and-drop remain supported.
- IndexedDB can locally remember imported road and building binary files, as well as satellite images and markers.

## How to actually see accurate roads and buildings

The reference files are published independently in [FeliciaDayZ's DayZ Vehicle Map repository](https://github.com/FeliciaDayZ/DayZ-Vehicle-Map). **They are not bundled, mirrored, or fetched by ZedForge.** Follow the links below, download files locally and use them only where you have appropriate rights.

1. [Nasdara satellite image (nasdara.png)](https://github.com/FeliciaDayZ/DayZ-Vehicle-Map/blob/main/data/maps/nasdara.png) — load with **Load satellite image**.
2. [Native road segments (nasdara.roads)](https://github.com/FeliciaDayZ/DayZ-Vehicle-Map/blob/main/data/roads/nasdara.roads) — load with **Load actual roads**.
3. [Native structure placement/footprints (nasdara.objects)](https://github.com/FeliciaDayZ/DayZ-Vehicle-Map/blob/main/data/objects/nasdara/nasdara.objects) — load with **Load building footprints**.
4. **For building/roof imagery:** separately obtain the project’s [numbered picture files](https://github.com/FeliciaDayZ/DayZ-Vehicle-Map/tree/main/data/objects/nasdara/pictures), if you have permission to use them. Select the PNG files in the browser, or place them into one ZIP and import the ZIP using **Load detailed building pictures**.
5. Optionally add `cfgeventspawns.xml` from your server and inspect event positions.

**Without the additional numbered pictures, the structure file renders footprint polygons rather than textured roofs.** Adding matching images allows much more detailed close-up artwork, but source satellite texture resolution is still limited by the image you load.

## Calibration and data formats

Nasdara world extent: X and Z from 0–16,384 metres. North-up projected image:
```
image_x = world_x / 16384 * image_width
image_y = (1 - world_z / 16384) * image_height
```
The original satellite is 4096 px wide, or 4 metres per native pixel.

Binary parsers are strict: `DVMROAD1` has a 16-byte header and 20-byte segments, and `DVMOBJ1\0` has 28-byte header, 60-byte model records, ring/point arrays and 20-byte placement records. Invalid world sizes, unexpected bytes, malformed records and out-of-range coordinates are rejected. These are the documented *DayZ Vehicle Map project* formats, not official DayZ XML formats. Roads from generic GeoJSON may alternatively be imported using in-game X/Z coordinates.

## Browser requirements and limitations

- Recent Chromium/Opera, Firefox or Safari with Canvas 2D, Path2D, IndexedDB and local file APIs. Large source images may exceed browser storage or graphics memory quotas.
- The viewer **does not bundle any DayZ images**. Local loading is not redistribution permission.
- It does not load official game archives directly; separate extraction/conversion is required.
- Imported `cfgeventspawns.xml` is read-only here; marker CSV is not game-ready spawn XML.
- The source satellite image cannot gain texture detail just by zooming. For more detailed imagery, a higher-resolution licensed terrain source and texture rendering/picture layers are needed.
- Some structure records are deliberately not drawn at far zoom to preserve speed.
- Structures without a matching numbered picture fall back to polygon footprints. Pictures and the structure binary must share the same model index mapping; files from different releases may be incompatible.
- No code or data from this build has been merged into the World War Z website.

## Test locally

```sh
python -m http.server 8000
node map-lab/projection.test.cjs
node map-lab/interface.test.cjs
node map-lab/mapdata.test.cjs
```

Large-volume synthetic stress checks were also performed at the reference record counts. Browser testing with actual independently published files and terrain data is still required before treating visual quality or exact alignment as verified.

## Attribution and permissions

The original [DayZ Vehicle Map project](https://github.com/FeliciaDayZ/DayZ-Vehicle-Map) documents the satellite extraction and road/structure formats. Its README credits DayZed.GG for the source road and structure geometry; copying, bundling or redistributing those assets may require relevant permission. ZedForge only provides local **import/parser/rendering code**, plus links to the original source. Use permitted files only.
