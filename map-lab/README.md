# ZedForge Nasdara Map Lab (experimental)

A standalone, browser-based prototype for **calibrated Nasdara satellite imagery**. This is not a replacement for the World War Z website map, and no World War Z repository files are modified.

Open: https://IIllIFOGGYIIllI.github.io/ZedForge/map-lab/

## What works

- Load **your own Nasdara satellite image** (PNG/JPG/WebP) locally, without transmitting it.
- 16,384 m × 16,384 m world projection, north-up, derived from documented terrain calibration.
- Mouse wheel zoom anchored to cursor, drag to pan, coordinate readout.
- Lookup of precise X/Z coordinates, shift-click to create markers, download marker CSV.
- Optional `cfgeventspawns.xml` overlay, event filters and optional road GeoJSON overlay using world coordinates.
- Grid and layer toggles, responsive interface, canvas-only rendering.
- No map images, downloaded external maps, or community providers' tiles are bundled.

## Calibration

Nasdara world extent: 0–16,384 m on both X and Z axes. North-up satellite image coordinates:

```
image_x = x / 16384 * image_width
image_y = (1 - z / 16384) * image_height
```

A 4,096 × 4,096 source would represent four metres per pixel. The viewer can display other image sizes, but **image bounds and orientation must already be aligned to Nasdara's world extent**.

## Important limitations

- This prototype does **not** source map imagery or road geometry and cannot magically improve a poor-quality satellite source. Use only imagery you own or are permitted to process.
- It accepts road layers in **raw game-coordinate GeoJSON** (coordinate pair is `[X,Z]`). It does not interpret WGS84 longitude/latitude.
- It does not export `cfgeventspawns.xml` edits yet. Marker CSV is for review, not a drop-in server file.
- Some image browsers can run out of graphics memory when decoding very large source images.
- Marker state is session-only; export CSV before leaving.
- Loading a local image does not establish permission to redistribute it in a public application.
- Do not copy third-party map website tile resources or publish extracted DayZ textures without checking licensing/permissions.

## Next steps

Test on an image extracted or obtained with the necessary rights. If the source aligns, add a licensed road dataset, imagery tiling for deep zoom, and ultimately an official, consented integration into ZedForge and World War Z. Nothing should be merged into the WWZ site until authorised.
