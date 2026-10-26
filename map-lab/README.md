# Nasdara Map Lab — consolidated mapping release (v0.4.0)

**The ZedForge map is standalone. The World War Z website is not modified.**

## Built-in permanent Nasdara places (v0.4.1)

**78 named locations display automatically** with no extra CSV required:
**2 cities, 14 towns, 42 villages, 6 industrial districts/sites,
1 airfield and 13 military installations**. Place names appear with
category-specific symbols, colours and collision-aware labels; all 78
can be found in the sidebar search, including when zoomed out.

Source: [Nasdara interactive guide](https://www.nasdaramap.com/guide),
which lists named places and **100-metre game grid references**.
To avoid false precision, each map marker uses the **centre of the
published 100 m square (±50 m per axis)**. These markers are useful
landmark guides, **not exact surveyed building entrances**.
User-supplied CSV or GeoJSON coordinates can override any individual
place by name while retaining the rest of the built-in locations.

Permanent locations are grouped into **Villages**, **Military
installations**, and **Industry / airfields** filters. Cities and towns
remain available under the main places toggle.

**No dynamic event or vehicle spawn markers were added.** Their generic
pin display is disabled until category-appropriate icons and
classification can be implemented. Existing local event files are
not modified or deleted.

## New: one consolidated map upgrade

This release adds **real data-driven place names and forests**, search/navigation,
optional **multi-resolution satellite imagery**, landmark-alignment checks, and
a cached minimap. Previous yellow paved roads, adjustable metre-based widths,
building imagery and stability improvements remain unchanged.

### Imported place labels and search

Import a CSV or GeoJSON with verified **DayZ world X/Z**, not latitude/longitude.
CSV needs at least `name,x,z`; an optional `category` can be `town`, `city`,
`village`, `military`, `airfield`, `fuel`, `trader`, `landmark`, `medical`,
`water`, `forest`, or `other`. Example CSV:

```csv
name,x,z,category
Example Location,8192,8192,landmark
```

The example is a *format demonstration*, **not a real Nasdara landmark**.
Valid imported names are drawn with collision-aware map labels. The sidebar
search finds an imported location and jumps to its exact world coordinates.

### Real tree locations (optional)

Import CSV `name,x,z` or GeoJSON Point features from a legitimate tree
position dataset. This uses actual supplied X/Z anchors and zoom-dependent
dot rendering with spatial viewport culling. Tree-position files are **not
included or invented**. The existing satellite-based vegetation enhancement
is independent and still available.

### Higher-resolution satellite tile packs

The browser supports an optional user-created tile ZIP:
- ZIP root: `zedforge-tiles.json` with
  `{"format":"zedforge-tiles-v1","worldSize":16384,"tiles":[...]}`.
- Each tile: `{"path":"tiles/l4/000_000.jpg","x":0,"z":15360,"width":1024,"height":1024,"level":4}`
  where X/Z/width/height are *world metres* and origin is south-west.
- Images are loaded and decoded **only for the current viewport**, limited
  to three concurrent decodes and a 144 MiB decoded-image cache.
- The existing satellite remains as fallback; the tile pack is **optional**.

A local tile-pack builder is included at `tools/build_nasdara_tiles.py`.
On a machine with Python and Pillow installed, use:

```sh
python -m pip install Pillow
python tools/build_nasdara_tiles.py nasdara-highres.png Nasdara_HD_Tiles.zip
```

Use a **lawfully obtained north-up full-world satellite image**. The script
generates levels from an existing image; it cannot manufacture image detail
beyond its source or provide proprietary game assets. ZIP files must be
250 MB or smaller and contain at most 1,800 tiles. Browsers may have tighter
local storage limits. The map also supports a tile-only overview if no
base image is loaded.

### Landmark coordinate verification

Import a CSV with columns `name,x,z,pixelX,pixelY`. For at least two
verified landmarks, Map Lab computes the median image translation (metres)
and residual RMS error. **The offset can be applied only when the RMS
is 20 metres or less and each offset component is within 500 metres**.

Only the satellite imagery is shifted. Road geometry, buildings, markers,
town labels and game coordinates remain in original world X/Z. If image
rotation, cropping or scale is wrong, a simple translation is insufficient:
a high residual error blocks automatically applying it. Reset restores
default calibration. *No landmark coordinates are presumed correct without
external ground truth.*

### Performance and regression

- The overview uses a **cached 180 px satellite thumbnail** instead of
  continuously downscaling a 4096 px image during movement.
- Spatial cell indexing culls tree and place positions outside the viewport.
- Collision-aware labels cap drawing to 90 names per frame.
- Tile decoding is lazy, concurrent-limited and LRU-bounded.
- A compact draw-time/loaded-tile/visible-roof status is shown in-map.
- Existing building work remains batched off-screen and road strokes remain
  width-calibrated and stable.

### Dataset and licensing limitations

Native `nasdara.roads` has only paved/dirt classes, **not a verified
major/minor road hierarchy**. ZedForge does not fabricate town names, tree
coordinates or high-resolution textures. A truly sharper image or authentic
named/vegetation layer still requires an appropriate external source with
rights to use it.

---

## Previous map improvements

**[Launch Map Lab](https://IIllIFOGGYIIllI.github.io/ZedForge/map-lab/)**

This is a separate ZedForge satellite-map prototype. It has **not modified or replaced the World War Z website map**.

## Road overlay now matches real-world width at close zoom

The earlier golden road strokes were still just **4 px outer / 2.6 px inner** at 64× zoom, which visibly failed to cover the satellite road underneath.

- Close-up paved-road overlays now scale using **pixels per world metre**, calculated from the calibrated Nasdara camera; the default **8.0 m** road is approximately 16–17 px across in the user's 64× screenshot.
- Added a **Road overlay width** control from 3 to 12 metres (default 8), persisted in local browser settings. The dirt road overlay scales to approximately 55% of the paved-road width.
- Retains golden-yellow paved roads, tan dirt tracks and a contrasting dark edge on both.
- Old, fixed **overview zoom widths stay exactly the same**. The existing cached overview, repair joins and structure performance optimisations are retained.
- Width changes only schedule an ordinary map redraw; they do not re-import the road data or regenerate the full overview buffer.
- **Limitation:** the dataset contains line centre positions and road class, not per-road physical lane widths. The metre-based width and slider substantially improve coverage, but some individual roads may still be wider/narrower or slightly offset.

## Yellow paved-road styling and close-zoom widths

- **Paved roads:** golden yellow `#f2d35b` centres, dark brown `#5a4a1f` borders.
- **Dirt roads:** muted tan `#d8c29a` centres, brown-grey `#4b4338` borders.
- **Close zoom:** paved strokes expand from 3.25/2.0 to **4.0/2.6 px** (outer/inner); dirt from 2.30/1.30 to **2.8/1.7 px**.
- **Overview:** unchanged stroke widths; the yellow paved classification remains visible without crowding the map.
- Existing zoom-dependent buffers, intersection repairs, visibility slider, building renderer and vegetation control are untouched.

## Nasdara junction continuity and vegetation enhancement

- Neighbouring road endpoints are conservatively joined **only if** they are within 6.5 metres, use the same road class, face one another and have an unambiguous nearest match.
- Source `.roads` coordinates are never rewritten; short connecting segments exist only in the browser-rendered overlay. Long gaps, parallel carriageways and uncertain connections are left untouched.
- Roads now use rounded caps. All paved/dirt outlines are painted first and their lighter centre strokes afterward, avoiding dark wedges at intersections.
- Junction repairs are included in the stable wide-area road image and spatially indexed close-up rendering.
- **Vegetation detail** (0–100%) selectively highlights existing green/olive pixels from the original satellite image. It operates locally, can be turned completely off and does not invent trees or improve the image's native resolution.
- Vegetation masks are calculated once when imagery is loaded, then composited with the same calibrated world projection; the map's source image remains unchanged.
- Road visibility remains independently adjustable and retains the brighter, high-contrast style.
- In the tested 47,236-segment Nasdara road dataset, 23,646 conservative links met the alignment and short-gap criteria. This is a rendering repair count, not a modification to the imported game data; some ambiguous junctions are deliberately excluded.

## Building flicker and performance update

After reviewing the second in-browser video from 26 October, the previous
renderer was confirmed to repaint thousands of textured structures on each
navigation frame. The fix changes the architecture rather than hiding
buildings or disabling the overlays:

- Buildings are painted into a transparent back buffer in **140-object batches**.
  Only completed building images are presented to the visible map canvas.
- During camera movement the **last complete building layer** is accurately
  translated and scaled to the current world coordinates until the replacement
  finishes. No partly drawn buildings can appear.
- Rapid panning cancels outdated building jobs instead of queuing unnecessary
  synchronous work. Background picture decode triggers a batched subsequent
  update rather than repeatedly clearing the map.
- Draw order is stable by numeric placement index to avoid layers changing when
  moving across grid cells.
- The local decoded-model cache is raised to 192 MiB / 550 models for desktop
  use, reducing repeated picture eviction and decoding.
- Road visibility defaults to **120%** (in its own control) with lighter paved
  and dirt colours; the stabilized cached roads stay clearly visible.
- Road visibility can be adjusted independently of the overall overlay
  strength. Your existing local map assets remain unchanged.

Automated regressions check incremental painting, cancellation, roof counts
and the independent road control. Actual browser performance with the complete
model picture set still requires verification.

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
- The source satellite image cannot gain texture detail just by zooming. Vegetation detail is a colour-based enhancement, not a tree-position dataset. For individual trees or richer ground textures, higher-resolution licensed imagery or terrain/object asset data is required.
- Some structure records are deliberately not drawn at far zoom to preserve speed.
- Structures without a matching numbered picture fall back to polygon footprints. Pictures and the structure binary must share the same model index mapping; files from different releases may be incompatible.
- No code or data from this build has been merged into the World War Z website.

## Test locally

```sh
python -m http.server 8000
node map-lab/projection.test.cjs
node map-lab/interface.test.cjs
node map-lab/mapdata.test.cjs
node map-lab/road-stability.test.cjs
node map-lab/building-stability.test.cjs
node map-lab/vegetation.test.cjs
node map-lab/advanced.test.cjs
node map-lab/places.test.cjs
node map-lab/advanced-integration.test.cjs
```

Large-volume synthetic stress checks were also performed at the reference record counts. Browser testing with actual independently published files and terrain data is still required before treating visual quality or exact alignment as verified.

## Attribution and permissions

The original [DayZ Vehicle Map project](https://github.com/FeliciaDayZ/DayZ-Vehicle-Map) documents the satellite extraction and road/structure formats. Its README credits DayZed.GG for the source road and structure geometry; copying, bundling or redistributing those assets may require relevant permission. ZedForge only provides local **import/parser/rendering code**, plus links to the original source. Use permitted files only.
