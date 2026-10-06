// Interactive world map for any page that contains <div class="eryndor-map"></div>.
//
// Written as plain JavaScript on purpose (no TypeScript syntax): Quartz bundles it
// through esbuild, and the very same file can be loaded straight into a browser for
// testing outside of Quartz. Do not use the word "ex" + "port" anywhere in this file,
// including comments: Quartz's inline-script loader strips the first occurrence.
//
// Data flow:
//   /static/map/tiles/{z}/{x}/{y}.jpg   tile pyramid cut from the source image
//   /static/map/places.json             markers (pixel coordinates on the source image)
//   /static/contentIndex.json           Quartz page index, used to turn a place name
//                                       into a link to its lore page

const LEAFLET_VERSION = "1.9.4"
const LEAFLET_CSS = {
  href: "https://unpkg.com/leaflet@" + LEAFLET_VERSION + "/dist/leaflet.css",
  integrity: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
}
const LEAFLET_JS = {
  src: "https://unpkg.com/leaflet@" + LEAFLET_VERSION + "/dist/leaflet.js",
  integrity: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
}

// Overridable per map with data-* attributes on the container, e.g. data-tiles="..."
const DEFAULTS = {
  tiles: "/static/map/tiles/{z}/{x}/{y}.jpg",
  places: "/static/map/places.json",
  width: 10240, // source image size in pixels
  height: 5760,
  nativeZoom: 5, // zoom level where one tile pixel equals one source pixel
  extraZoom: 1, // how much further than native the reader may zoom (tiles get upscaled)
}

// Zoom range in which each kind of place is shown. places.json "types" can override these.
// Zoomed all the way out is roughly zoom 1; each +1 doubles the scale.
const DEFAULT_TYPES = {
  region: { minZoom: 0, maxZoom: 2.25, label: "Nation" },
  capital: { minZoom: 2.5, label: "Capital" },
  city: { minZoom: 2.5, label: "City" },
  town: { minZoom: 3, label: "Town" },
  village: { minZoom: 4, label: "Village" },
  landmark: { minZoom: 3, label: "Landmark" },
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L)
  if (window.__leafletPromise) return window.__leafletPromise
  window.__leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector("link[data-leaflet]")) {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = LEAFLET_CSS.href
      link.integrity = LEAFLET_CSS.integrity
      link.crossOrigin = ""
      link.dataset.leaflet = "1"
      document.head.appendChild(link)
    }
    const script = document.createElement("script")
    script.src = LEAFLET_JS.src
    script.integrity = LEAFLET_JS.integrity
    script.crossOrigin = ""
    script.onload = () => resolve(window.L)
    script.onerror = () => {
      window.__leafletPromise = null
      reject(new Error("Leaflet failed to load"))
    }
    document.head.appendChild(script)
  })
  return window.__leafletPromise
}

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[\s_-]+/g, " ")
    .trim()
const tight = (s) => norm(s).replace(/\s+/g, "")

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])

// Build lookup tables from Quartz's content index so a place can be linked by name.
async function loadPageIndex() {
  let data = {}
  try {
    // fetchData is defined by Quartz on every page (a promise of static/contentIndex.json)
    data = typeof fetchData !== "undefined" ? await fetchData : {}
  } catch (e) {
    data = {}
  }
  const byTitle = new Map()
  const byName = new Map()
  const byTight = new Map()
  for (const [slug, entry] of Object.entries(data || {})) {
    const last = slug.split("/").pop()
    if (entry && entry.title) {
      byTitle.set(norm(entry.title), slug)
      byTight.set(tight(entry.title), slug)
    }
    if (last && last !== "index") {
      const name = decodeURIComponent(last).replace(/-/g, " ")
      if (!byName.has(norm(name))) byName.set(norm(name), slug)
      if (!byTight.has(tight(name))) byTight.set(tight(name), slug)
    }
  }
  return { byTitle, byName, byTight }
}

function resolveSlug(place, index) {
  const key = place.page || place.name
  if (!key) return null
  if (typeof key === "string" && key.startsWith("/")) return key.replace(/^\/+/, "")
  return (
    index.byTitle.get(norm(key)) ||
    index.byName.get(norm(key)) ||
    index.byTight.get(tight(key)) ||
    null
  )
}

function readConfig(el) {
  const d = el.dataset
  const num = (v, fallback) => (v !== undefined && v !== "" && !isNaN(+v) ? +v : fallback)
  return {
    tiles: d.tiles || DEFAULTS.tiles,
    places: d.places || DEFAULTS.places,
    width: num(d.width, DEFAULTS.width),
    height: num(d.height, DEFAULTS.height),
    nativeZoom: num(d.nativeZoom, DEFAULTS.nativeZoom),
    extraZoom: num(d.extraZoom, DEFAULTS.extraZoom),
  }
}

async function loadPlaces(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(res.status + " " + res.statusText)
    const json = await res.json()
    if (Array.isArray(json)) return { types: {}, places: json }
    return { types: json.types || {}, places: json.places || [] }
  } catch (e) {
    console.warn("[worldmap] could not load places from " + url, e)
    return { types: {}, places: [] }
  }
}

function popupHtml(place, typeLabel, slug) {
  const meta = [typeLabel, place.nation].filter(Boolean).join(" · ")
  let body = ""
  if (place.blurb) body += '<div class="em-popup-blurb">' + esc(place.blurb) + "</div>"
  if (slug) {
    body +=
      '<a class="em-popup-link" href="' + encodeURI("/" + slug) + '">Open lore page</a>'
  } else {
    body += '<div class="em-popup-missing">No lore page yet</div>'
  }
  return (
    '<div class="em-popup">' +
    '<div class="em-popup-title">' +
    esc(place.name) +
    "</div>" +
    (meta ? '<div class="em-popup-meta">' + esc(meta) + "</div>" : "") +
    body +
    "</div>"
  )
}

async function buildMap(L, el, index) {
  const cfg = readConfig(el)
  const maxZoom = cfg.nativeZoom + cfg.extraZoom

  const map = L.map(el, {
    crs: L.CRS.Simple,
    minZoom: 0,
    maxZoom: maxZoom,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 90,
    attributionControl: false,
    maxBoundsViscosity: 1,
  })

  const toLatLng = (x, y) => map.unproject([x, y], cfg.nativeZoom)
  const bounds = L.latLngBounds(toLatLng(0, cfg.height), toLatLng(cfg.width, 0))

  L.tileLayer(cfg.tiles, {
    minZoom: 0,
    maxZoom: maxZoom,
    maxNativeZoom: cfg.nativeZoom,
    bounds: bounds,
    noWrap: true,
    keepBuffer: 4,
  }).addTo(map)

  const fitWholeMap = () => {
    map.setMinZoom(0)
    const z = map.getBoundsZoom(bounds)
    map.setMinZoom(z)
    return z
  }
  fitWholeMap()
  map.fitBounds(bounds)
  map.setMaxBounds(bounds.pad(0.02))
  map.on("resize", () => {
    const z = fitWholeMap()
    if (map.getZoom() < z) map.fitBounds(bounds)
  })

  // ---- markers -------------------------------------------------------------
  const data = await loadPlaces(cfg.places)
  const types = Object.assign({}, DEFAULT_TYPES)
  for (const [k, v] of Object.entries(data.types)) types[k] = Object.assign({}, DEFAULT_TYPES[k] || {}, v)

  const groups = new Map() // "type@minZoom" -> { minZoom, layer }
  const usedTypes = new Map()
  for (const place of data.places) {
    if (!place || typeof place.x !== "number" || typeof place.y !== "number") continue
    const typeKey = types[place.type] ? place.type : "town"
    const type = types[typeKey]
    const minZoom = typeof place.minZoom === "number" ? place.minZoom : type.minZoom
    const maxZoomFor =
      typeof place.maxZoom === "number"
        ? place.maxZoom
        : typeof type.maxZoom === "number"
          ? type.maxZoom
          : Infinity
    const groupKey = typeKey + "@" + minZoom + "-" + maxZoomFor
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { minZoom: minZoom, maxZoom: maxZoomFor, layer: L.layerGroup() })
    }
    usedTypes.set(typeKey, type)

    const slug = resolveSlug(place, index)
    const icon = L.divIcon({
      className: "em-marker-wrap",
      iconSize: [0, 0],
      iconAnchor: [0, 0],
      popupAnchor: [0, -10],
      html:
        '<div class="em-marker em-' +
        esc(typeKey) +
        (slug ? " em-linked" : "") +
        '"><span class="em-dot"></span><span class="em-label">' +
        esc(place.name) +
        "</span></div>",
    })
    const marker = L.marker(toLatLng(place.x, place.y), {
      icon: icon,
      title: place.name,
      riseOnHover: true,
      keyboard: false,
    })
    marker.bindPopup(popupHtml(place, type.label || typeKey, slug), {
      closeButton: false,
      className: "em-popup-box",
      autoPanPadding: [24, 24],
    })
    groups.get(groupKey).layer.addLayer(marker)
  }

  const syncVisibility = () => {
    const z = map.getZoom()
    for (const g of groups.values()) {
      const show = z + 1e-6 >= g.minZoom && z - 1e-6 <= g.maxZoom
      if (show && !map.hasLayer(g.layer)) g.layer.addTo(map)
      else if (!show && map.hasLayer(g.layer)) map.removeLayer(g.layer)
    }
    el.dataset.zoom = z.toFixed(2)
    el.dataset.zoomBand = String(Math.max(0, Math.min(4, Math.floor(z)))) // used by CSS to size labels
  }
  map.on("zoomend", syncVisibility)
  syncVisibility()

  // ---- legend --------------------------------------------------------------
  if (usedTypes.size > 0) {
    const Legend = L.Control.extend({
      options: { position: "bottomleft" },
      onAdd: function () {
        const box = L.DomUtil.create("div", "em-legend")
        L.DomEvent.disableClickPropagation(box)
        const order = Object.keys(DEFAULT_TYPES).concat(Array.from(usedTypes.keys()))
        const seen = new Set()
        for (const key of order) {
          if (seen.has(key) || !usedTypes.has(key)) continue
          seen.add(key)
          const type = usedTypes.get(key)
          const row = L.DomUtil.create("div", "em-legend-row", box)
          row.innerHTML =
            '<span class="em-marker em-' +
            esc(key) +
            '"><span class="em-dot"></span></span><span>' +
            esc(type.label || key) +
            "</span>"
        }
        return box
      },
    })
    map.addControl(new Legend())
  }

  // ---- coordinate picker (for authoring places.json) -----------------------
  // While picking, clicking anywhere shows the pixel coordinates and copies a ready-made
  // places.json line. Detected-but-unnamed settlement dots (candidates.json) are shown as
  // numbered grey markers so they can be named without hunting for coordinates.
  let picking = false
  let candidateLayer = null

  const showCoordinates = (latlng, x, y, note) => {
    const snippet = '{ "name": "", "type": "town", "x": ' + x + ', "y": ' + y + " }"
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(snippet).catch(() => {})
    }
    const html =
      '<div class="em-popup"><div class="em-popup-title">x: ' +
      x +
      ", y: " +
      y +
      "</div>" +
      (note ? '<div class="em-popup-meta">' + esc(note) + "</div>" : "") +
      '<code class="em-snippet">' +
      esc(snippet) +
      '</code><div class="em-popup-meta">' +
      (navigator.clipboard ? "Copied to clipboard" : "Select and copy") +
      "</div></div>"
    L.popup({ className: "em-popup-box", closeButton: true, autoPanPadding: [24, 24] })
      .setLatLng(latlng)
      .setContent(html)
      .openOn(map)
  }

  const loadCandidates = async () => {
    if (candidateLayer) return candidateLayer
    candidateLayer = L.layerGroup()
    const url = cfg.places.replace(/[^/]*$/, "candidates.json")
    let list = []
    try {
      const res = await fetch(url)
      if (res.ok) list = await res.json()
    } catch (e) {
      list = []
    }
    const placed = data.places.filter((p) => typeof p.x === "number" && typeof p.y === "number")
    const isNamed = (c) => placed.some((p) => Math.abs(p.x - c.x) < 30 && Math.abs(p.y - c.y) < 30)
    let n = 0
    for (const c of list) {
      if (!c || typeof c.x !== "number" || typeof c.y !== "number" || isNamed(c)) continue
      n++
      const icon = L.divIcon({
        className: "em-marker-wrap",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        html: '<div class="em-marker em-candidate"><span class="em-dot"></span><span class="em-label">' + n + "</span></div>",
      })
      const m = L.marker(toLatLng(c.x, c.y), { icon: icon, keyboard: false })
      const num = n
      m.on("click", () => showCoordinates(m.getLatLng(), c.x, c.y, "Unnamed dot #" + num))
      candidateLayer.addLayer(m)
    }
    return candidateLayer
  }

  const Picker = L.Control.extend({
    options: { position: "topright" },
    onAdd: function () {
      const btn = L.DomUtil.create("button", "em-pick-btn")
      btn.type = "button"
      btn.title =
        "Turn on, then click the map to get pixel coordinates for places.json. Unnamed settlement dots are numbered."
      btn.textContent = "Coordinates"
      L.DomEvent.disableClickPropagation(btn)
      L.DomEvent.on(btn, "click", async () => {
        picking = !picking
        btn.classList.toggle("active", picking)
        el.classList.toggle("em-picking", picking)
        if (picking) {
          const layer = await loadCandidates()
          if (picking) layer.addTo(map)
        } else {
          map.closePopup()
          if (candidateLayer) map.removeLayer(candidateLayer)
        }
      })
      return btn
    },
  })
  map.addControl(new Picker())

  map.on("click", (e) => {
    if (!picking) return
    const pt = map.project(e.latlng, cfg.nativeZoom)
    showCoordinates(e.latlng, Math.round(pt.x), Math.round(pt.y), "")
  })

  setTimeout(() => map.invalidateSize(), 50)
  return map
}

document.addEventListener("nav", async () => {
  const containers = Array.from(document.querySelectorAll(".eryndor-map"))
  if (containers.length === 0) return

  let L
  try {
    L = await loadLeaflet()
  } catch (e) {
    for (const el of containers) el.textContent = "The map could not be loaded. Please try again later."
    return
  }

  const index = await loadPageIndex()
  for (const el of containers) {
    if (el.dataset.mapReady) continue
    el.dataset.mapReady = "1"
    try {
      const map = await buildMap(L, el, index)
      if (window.addCleanup) {
        window.addCleanup(() => {
          try {
            map.remove()
          } catch (e) {}
          delete el.dataset.mapReady
        })
      }
    } catch (e) {
      console.error("[worldmap]", e)
      el.textContent = "The map could not be loaded."
    }
  }
})
