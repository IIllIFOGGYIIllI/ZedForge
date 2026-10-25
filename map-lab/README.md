# ZedForge Nasdara Map Lab (experimental)

A standalone, browser-based prototype for **calibrated Nasdara satellite imagery**. The World War Z website is not modified or coupled to this project.

**Preview:** https://IIllIFOGGYIIllI.github.io/ZedForge/map-lab/

## Current features — Map Lab update (v0.3.2)

- Load a locally supplied Nasdara satellite image (PNG, JPG, or WebP).
- Use 16,384 × 16,384 metre world calibration, north-up.
- Smooth pan and anchored zoom using the actual game X/Z coordinates.
- **Optionally remember the satellite image in browser IndexedDB**, without uploading it to any server. Check/uncheck **Remember image locally**, and use **Forget saved image** to remove saved imagery.
- Restore your map position, markers, road GeoJSON and event-spawn overlays after refreshing when browser storage permits.
- Drag and drop satellite imagery onto the map.
- Inspect native satellite resolution in metres per pixel; a 4,096px Nasdara image is **4 m/pixel** and will not magically show individual small objects at extreme zoom.
- Add, label, select, edit and delete coordinate markers; export CSV of labelled markers.
- Optional road GeoJSON overlays in raw **[X,Z] game coordinates** and an optional `cfgeventspawns.xml` layer with event filtering.
- Grid, layer toggles, double-click zoom, shift-click markers, and keyboard-safe coordinate entry.
- Source files are handled locally; no third-party map websites are scraped.

## Start testing

Open the [Map Lab](https://IIllIFOGGYIIllI.github.io/ZedForge/map-lab/).

1. Upload an image you are permitted to use. For a privately evaluated source, review the Nasdara map project linked inside the Map Lab.
2. Zoom and pan, then use the X/Z inputs to locate a known game position.
3. If desired, import your own road GeoJSON or `cfgeventspawns.xml` and filter spawn points.
4. Shift-click to place markers or type X/Z values and use Add Marker. Select a marker from the list to edit its coordinates or label.
5. Export labelled marker CSV. This is not a game-ready spawn XML.

Your local storage might not support an image as large as the source file, or site data might be cleared later. **Always export critical coordinate work.**

## Calibration

Nasdara world extent: 0–16,384 m on both axes. A correctly calibrated, north-up image maps to world positions as:

```
image_x = world_x / 16384 * image_width
image_y = (1 - world_z / 16384) * image_height
```

An image that has been cropped, rotated, stretched, or padded with borders will not automatically align. The Map Lab does not currently offer image calibration controls.

## Not yet implemented

- Server-ready edits to `cfgeventspawns.xml` (the overlay is read-only).
- Higher-resolution satellite tile pyramid / streamed source images.
- Verified building footprint and fully licensed road layers.
- Click-to-place polygons and circles.
- Official publishing of proprietary DayZ-derived assets. Loading locally does **not** grant redistribution permission.
- Integration into the WWZ site (explicitly excluded until requested).

## Automated tests

```sh
node map-lab/projection.test.cjs
node map-lab/interface.test.cjs
```

The projection test covers coordinate transforms, image calibration, anchored zoom and boundaries. The interface test catches missing IDs, missing assets, unsupported external script dependencies and markup wiring.

## Asset licensing

No proprietary imagery is included. The linked [DayZ Vehicle Map project](https://github.com/FeliciaDayZ/DayZ-Vehicle-Map) independently publishes reference Nasdara imagery and documents a terrain extraction method; independently verify your right to use or redistribute any third-party source. The Map Lab's local file workflow avoids copying those images into ZedForge or World War Z.
