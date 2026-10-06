# Map tooling

Scripts for turning a new export of the Eryndor map into the tiles and marker helpers used by
the interactive map (`content/Map of Eryndor.md`, `quartz/components/WorldMap.tsx`).
They only need Windows PowerShell; no Node, Python or ImageMagick.

## When a new map image is exported

1. **Cut tiles** (replaces `quartz/static/map/tiles`, about 1,250 files / 13 MB):

   ```powershell
   .\tools\map\make-tiles.ps1 -Source "C:\path\to\Eryndor Full Map 02.jpg"
   ```

   The image should stay 10240 x 5760. If the size changes, update `width`/`height` in
   `quartz/components/scripts/worldmap.inline.js` (or set `data-width`/`data-height` on the map div).
   Existing marker coordinates are pixels on the source image, so a same-size re-export keeps them valid.

2. **Detect settlement dots** (writes `quartz/static/map/candidates.json`):

   ```powershell
   .\tools\map\find-dots.ps1 -Source "C:\path\to\Eryndor Full Map 02.jpg"
   ```

   Finds the solid white dots and the white-ring dots. These show up as numbered red markers on the
   map page while the **Coordinates** button is on, so unnamed places can be named without hunting for
   pixel positions. Dots already listed in `places.json` are hidden from the overlay.

## Naming places

Edit `quartz/static/map/places.json`. Each entry needs `name`, `type` and `x`/`y`. Links to lore pages
are resolved automatically by matching the name (or `page`) against page titles. See the `_readme`
block inside the file for the optional fields and the zoom level at which each type appears.
