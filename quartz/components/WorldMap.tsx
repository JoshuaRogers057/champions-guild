import { QuartzComponent, QuartzComponentConstructor } from "./types"
// @ts-ignore
import script from "./scripts/worldmap.inline"
import style from "./styles/worldmap.scss"

/**
 * Interactive world map.
 *
 * This component renders nothing itself. It only ships the script and styles that
 * turn any `<div class="eryndor-map"></div>` found in page content into a pannable,
 * zoomable Leaflet map with place markers (see quartz/static/map/places.json).
 *
 * Add it once to the shared layout so every page can host a map.
 */
export default (() => {
  const WorldMap: QuartzComponent = () => <></>
  WorldMap.css = style
  WorldMap.afterDOMLoaded = script
  return WorldMap
}) satisfies QuartzComponentConstructor
