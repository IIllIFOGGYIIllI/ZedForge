#!/usr/bin/env python3
"""Build a local-first, multi-resolution ZedForge Nasdara tile pack.

Requires: python -m pip install Pillow
Usage: python tools/build_nasdara_tiles.py nasdara-highres.png Nasdara_HD_Tiles.zip

The input must be a permitted north-up, square satellite image calibrated
to the complete 16384 m × 16384 m Nasdara world. Does not extract DayZ game
files, obtain imagery, scrape third-party websites, or improve native detail.
"""
from __future__ import annotations

import argparse
import io
import json
import math
import zipfile
from pathlib import Path

from PIL import Image

WORLD = 16384


def build(source: Path, destination: Path, tile_size: int = 1024, quality: int = 90) -> dict:
    if tile_size not in (512, 1024, 2048):
        raise ValueError("Tile size must be 512, 1024 or 2048")
    if source.resolve() == destination.resolve():
        raise ValueError("Input and output must be different paths")
    with Image.open(source) as image:
        if image.width != image.height or image.width < 2048:
            raise ValueError("Use a square, full-world source at least 2048px wide")
        if image.width * image.height > 350_000_000:
            raise ValueError("Source exceeds safe 350 megapixel image processing limit")
        image = image.convert("RGB")
        highest = max(0, math.floor(math.log2(image.width / tile_size)))
        levels = sorted({0, min(2, highest), highest})
        records = []
        destination.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_STORED) as archive:
            for level in levels:
                dimension = min(image.width, tile_size * 2 ** level)
                if dimension == image.width:
                    layer = image
                else:
                    layer = image.resize((dimension, dimension), Image.Resampling.LANCZOS)
                for top in range(0, dimension, tile_size):
                    for left in range(0, dimension, tile_size):
                        right, bottom = min(left + tile_size, dimension), min(top + tile_size, dimension)
                        region = layer.crop((left, top, right, bottom))
                        name = f"tiles/l{level}/{top // tile_size:03d}_{left // tile_size:03d}.jpg"
                        payload = io.BytesIO()
                        region.save(payload, "JPEG", quality=quality, optimize=True)
                        archive.writestr(name, payload.getvalue())
                        records.append({
                            "path": name, "x": WORLD * left / dimension,
                            "z": WORLD * (1 - bottom / dimension),
                            "width": WORLD * (right - left) / dimension,
                            "height": WORLD * (bottom - top) / dimension,
                            "level": level,
                        })
                if layer is not image:
                    layer.close()
            if len(records) > 1800:
                raise ValueError("More than 1800 tiles; reduce source resolution or increase tile size")
            manifest = {
                "format": "zedforge-tiles-v1", "worldSize": WORLD,
                "sourcePixels": image.width,
                "attribution": "Local user-supplied source; check original imagery rights",
                "tiles": records,
            }
            archive.writestr("zedforge-tiles.json", json.dumps(manifest, separators=(",", ":")))
        return {"tiles": len(records), "levels": levels, "sizeMB": destination.stat().st_size / 1048576}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build high-resolution local ZedForge satellite tiles")
    parser.add_argument("image", type=Path, help="Licensed, full-world, square north-up image")
    parser.add_argument("output", type=Path, help="Destination ZIP file")
    parser.add_argument("--tile-size", type=int, choices=(512, 1024, 2048), default=1024)
    parser.add_argument("--quality", type=int, default=90, choices=range(40, 96), metavar="[40-95]")
    args = parser.parse_args()
    result = build(args.image, args.output, args.tile_size, args.quality)
    print("Created", args.output, result)
    if result["sizeMB"] > 250:
        print("WARNING: archive exceeds Map Lab's 250 MB browser import limit; reduce quality.")


if __name__ == "__main__":
    main()
