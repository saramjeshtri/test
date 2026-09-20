'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import 'cesium/Build/Cesium/Widgets/widgets.css'

function centroid(feature: any): [number, number] {
  const pts = feature.geometry.coordinates[0].slice(0, -1)
  let x = 0
  let y = 0
  for (const [lon, lat] of pts) {
    x += lon
    y += lat
  }
  return [x / pts.length, y / pts.length]
}

function makeCard(name: string, value: number, status: string, color: number[], cardBg: string) {
  const S = 3 // draw at 3x so the card stays crisp on a Retina screen
  const w = 250
  const h = 104
  const canvas = document.createElement('canvas')
  canvas.width = w * S
  canvas.height = h * S
  const ctx = canvas.getContext('2d')!
  ctx.scale(S, S)
  const c = `rgb(${color[0]},${color[1]},${color[2]})`

  ctx.beginPath()
  ctx.roundRect(1, 1, w - 2, h - 2, 10)
  ctx.fillStyle = cardBg
  ctx.fill()
  ctx.strokeStyle = c
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(24, 30, 7, 0, Math.PI * 2)
  ctx.fillStyle = c
  ctx.fill()

  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = '600 19px system-ui, -apple-system, sans-serif'
  ctx.fillText(name, 42, 31)

  ctx.font = '700 34px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = c
  ctx.fillText(String(value), 24, 72)
  const numberWidth = ctx.measureText(String(value)).width

  ctx.font = '500 15px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillText(status, 24 + numberWidth + 12, 74)

  return canvas
}

const GROUND = 100
const CARD_HEIGHT = 520

// Zone cards: the image is drawn at 3x. They used to be too small to read the zone name at the home
// view; this is ~1.4x the old size (a further step up made neighbouring cards overlap each other).
const CARD_SCALE = 0.31
const CARD_NEAR = 1500
const CARD_NEAR_SCALE = 0.75
const CARD_FAR = 12000
const CARD_FAR_SCALE = 0.42
const CARD_W = 250
const CARD_H = 104

const CITY = { lon: 20.0822, lat: 41.1125, height: 120 }
const HOME = { pitch: -32, range: 4500 }
const ZONE_VIEW = { pitch: -38, range: 2000 }
const MAP_VIEW = { pitch: -89, range: 6500 }

const LIMITS = { minPitch: -89, maxPitch: -14, minRange: 260, maxRange: 12000 }
const MIN_ALTITUDE = 160

// ---- known bad geometry in Google's mesh: a failed photogrammetry patch toward the hillside ----
// north of Zona 2 (spiky, corrupted rooftops — a real defect in Google's own data, confirmed
// identical whether accessed via Cesium ion or a direct Google Maps key, so no client setting or
// clip-and-patch trick fixes the geometry itself, and the affected area turned out to be large,
// ~900m x 1200m, not a small block). It's confined to the hillside direction, though — so instead
// of masking it, this zone's fly-to camera is pointed south into the (fully clean) dense city.
// heading=0 here means the CAMERA sits north of the marker looking south (per Cesium's
// HeadingPitchRange convention, heading is measured from north toward east for the offset from
// target to camera) — verified empirically by picking screen coordinates, not just by the docs,
// since the first attempt (180) had this backwards and pointed straight at the defect instead.
const ZONE_HEADING: Record<string, number> = { 'area-2': 0 }

// ---- the one dial for 3D quality vs speed ----
// 1.0 = fastest and softest · 1.5 = balanced · 2.0 = sharpest and slowest
// Kept modest: on a typical laptop GPU, rendering cost scales with the square of this number.
const SHARPNESS_3D = 1.3

// ---- tile detail: one fixed value, never changed at runtime ----
// This used to switch between a relaxed value zoomed out and a tighter one zoomed in. That was
// removed: writing tileset.maximumScreenSpaceError forces Cesium to synchronously redo its whole
// tile-detail pass, which is a real hitch no matter how it's timed (debouncing it just delayed the
// stutter to right after you stop moving instead of removing it). A single fixed value never
// triggers that recompute at all. 8 is Cesium's own default and the value already confirmed to load
// reliably at full-city scale; going lower helps sharpness but costs both load time and per-frame
// render cost, which is the wrong trade for demo smoothness.
const SSE_FIXED = 8

function easeInOut(k: number) {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
}

/** What one zone's card, marker and pole show: same shape as public/data/values.json. */
export interface ZoneValue {
  areaId: string
  value: number
  color: number[]
  label: string
}

export interface MapPlace {
  name: string
  kind: 'area' | 'street' | 'spot'
  lon: number
  lat: number
}

/** Lower-case and strip diacritics so "kerko kalane" still finds "Kalaja". */
const fold = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const PLACE_VIEW = { pitch: -40, range: 850, mapRange: 1100 }

interface CityMapProps {
  /** Controlled fly-to target from outside (e.g. a sidebar zone list). Omit
   *  entirely for the plain, uncontrolled `<CityMap />` usage on the homepage
   *  -- passing `undefined` disables this behavior rather than fighting the
   *  map's own click-to-focus. Pass `null` to fly back to the full view. */
  focusZone?: string | null
  /** Fired when focus changes from *inside* the map (clicking a zone pin, or
   *  the "full view" button) -- lets an outside sidebar stay in sync. */
  onFocusChange?: (zoneId: string | null) => void
  /** Hides the map's own built-in control chrome (full-view button, 3D/map
   *  toggle, zoom/rotate cluster, hint text) so an embedding page can render
   *  its own instead, without the two colliding. Use the `CityMapHandle` ref
   *  to trigger the same actions from that outside UI. */
  hideChrome?: boolean
  onModeChange?: (mode: '3d' | 'map') => void
  onSpinningChange?: (spinning: boolean) => void
  /** Fired once the zone cards and markers exist -- the earliest anything can restyle them. */
  onZonesReady?: () => void
}

export interface CityMapHandle {
  nudge: (patch: { heading?: number; pitch?: number; range?: number }) => void
  switchMode: (mode: '3d' | 'map') => void
  goHome: () => void
  toggleSpin: () => void
  resetNorth: () => void
  /** Visually emphasizes one zone's marker without moving the camera --
   *  e.g. hovering a row in an evidence list. Pass null to clear. */
  highlightZone: (zoneId: string | null) => void
  /** Current camera heading in degrees -- lets an outside compass indicator
   *  poll and rotate to reflect the live view, not just sit static. */
  getHeading: () => number
  /** Named places (villages, landmarks, streets) matching the text -- the same set drawn
   *  as labels on the city. Accent- and case-insensitive; empty until the label file has loaded. */
  searchPlaces: (query: string, limit?: number) => MapPlace[]
  /** Flies to a place (3D or 2D, whichever is showing) and drops a marker on it. */
  flyToPlace: (place: MapPlace) => void
  /** Removes the marker left by flyToPlace. */
  clearPlaceMarker: () => void
  /** Repaints every zone's card, marker and pole from these values (e.g. a what-if simulation).
   *  Pass null to go back to the real ones. */
  setZoneValues: (values: ZoneValue[] | null) => void
}

export default forwardRef<CityMapHandle, CityMapProps>(function CityMap(
  { focusZone, onFocusChange, hideChrome, onModeChange, onSpinningChange, onZonesReady }: CityMapProps = {},
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const cesiumRef = useRef<any>(null)
  const tilesetRef = useRef<any>(null)

  const centerRef = useRef<any>(null)
  const camRef = useRef({ heading: 40, pitch: HOME.pitch, range: HOME.range })
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const animRef = useRef<any>(null)
  const zonesRef = useRef<Record<string, any>>({})
  const highlightedZoneRef = useRef<string | null>(null)
  const placesRef = useRef<MapPlace[]>([])
  const baseValuesRef = useRef<ZoneValue[]>([])
  const cardBgRef = useRef('')
  // Cesium keeps every image it has ever been given in one texture atlas and never frees any, so a new
  // canvas per repaint eventually overflows it (16384 px). A card image is identified by what it shows
  // and passed as a string: the same card is stored once however often the plan flips back to it.
  const cardUrlCache = useRef(new Map<string, string>())
  const paintedCardRef = useRef<Record<string, string>>({})

  const onFocusChangeRef = useRef(onFocusChange)
  const onZonesReadyRef = useRef(onZonesReady)
  useEffect(() => {
    onFocusChangeRef.current = onFocusChange
    onZonesReadyRef.current = onZonesReady
  }, [onFocusChange, onZonesReady])

  const [spinning, setSpinning] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const [zonesReady, setZonesReady] = useState(false)
  const [mode, setMode] = useState<'3d' | 'map'>('3d')
  const spinningRef = useRef(false)
  useEffect(() => {
    spinningRef.current = spinning
  }, [spinning])

  function apply() {
    const Cesium = cesiumRef.current
    const viewer = viewerRef.current
    if (!Cesium || !viewer || viewer.isDestroyed() || !centerRef.current) return

    const c = camRef.current
    c.range = Math.min(Math.max(c.range, LIMITS.minRange), LIMITS.maxRange)

    const safest = -Math.asin(Math.min(MIN_ALTITUDE / c.range, 1)) * (180 / Math.PI)
    const maxPitch = Math.min(LIMITS.maxPitch, safest)

    c.pitch = Math.min(Math.max(c.pitch, LIMITS.minPitch), maxPitch)
    c.heading = ((c.heading % 360) + 360) % 360

    viewer.camera.lookAt(
      centerRef.current,
      new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(c.heading),
        Cesium.Math.toRadians(c.pitch),
        c.range
      )
    )
    viewer.scene.requestRender()
  }

  function moveTo(targetCenter: any, pitch: number, range: number, heading?: number) {
    const fromHeading = camRef.current.heading
    animRef.current = {
      start: performance.now(),
      duration: 1100,
      fromCenter: centerRef.current.clone(),
      toCenter: targetCenter.clone(),
      fromPitch: camRef.current.pitch,
      toPitch: pitch,
      fromRange: camRef.current.range,
      toRange: range,
      fromHeading,
      toHeading: heading ?? fromHeading,
    }
    // apply() (called every frame while animRef is set) requests the render for each subsequent
    // frame, but nothing has asked for the *first* one yet — do that here or the animation never starts.
    viewerRef.current?.scene.requestRender()
  }

  function applyQuality(next: '3d' | 'map') {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return
    const dpr = window.devicePixelRatio || 1
    if (next === 'map') {
      // no 3D tiles to draw, so spend everything on a crisp map
      viewer.resolutionScale = Math.min(dpr, 2)
      viewer.scene.globe.maximumScreenSpaceError = 1
    } else {
      viewer.resolutionScale = Math.min(dpr, SHARPNESS_3D)
    }
  }

  function switchMode(next: '3d' | 'map') {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium) return
    setMode(next)
    onModeChange?.(next)
    if (tilesetRef.current) tilesetRef.current.show = next === '3d'
    viewer.scene.globe.show = next === 'map'
    applyQuality(next)
    if (next === 'map') {
      moveTo(centerRef.current, MAP_VIEW.pitch, MAP_VIEW.range)
    } else {
      moveTo(centerRef.current, HOME.pitch, HOME.range)
    }
  }

  useEffect(() => {
    let viewer: any
    let cancelled = false

    async function start() {
      ;(window as any).CESIUM_BASE_URL = '/cesium'
      const Cesium = await import('cesium')
      if (cancelled || !containerRef.current) return
      cesiumRef.current = Cesium

      Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_TOKEN as string

      viewer = new Cesium.Viewer(containerRef.current, {
        baseLayer: false,
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        // only redraw when something actually changes, instead of ~60 draws/sec even when the
        // camera is sitting still. Since the camera here is fully custom (Cesium's own controller
        // is disabled), every path that moves it has to explicitly ask for a redraw — see apply(),
        // moveTo(), and the spin toggle below.
        requestRenderMode: true,
      })
      viewerRef.current = viewer
      centerRef.current = Cesium.Cartesian3.fromDegrees(CITY.lon, CITY.lat, CITY.height)

      // ================= QUALITY vs SPEED =================
      // Only the 3D view is expensive. Map view has no 3D tiles, so it runs at full quality.
      // If 3D feels slow, lower SHARPNESS_3D: 1.0 fastest · 1.5 balanced · 2.0 sharpest
      viewer.useBrowserRecommendedResolution = false

      // anti-aliasing: unnecessary at high resolution, and expensive
      viewer.scene.msaaSamples = 1
      if (viewer.scene.postProcessStages.fxaa) {
        viewer.scene.postProcessStages.fxaa.enabled = false
      }
      // ====================================================

      // street map: OpenStreetMap — free, no API key, roads and names in Albanian
      viewer.imageryLayers.addImageryProvider(
        new Cesium.OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/',
          maximumLevel: 19,
          credit: '© OpenStreetMap contributors',
        })
      )
      viewer.scene.globe.show = false
      viewer.scene.globe.depthTestAgainstTerrain = false

      viewer.scene.screenSpaceCameraController.enableInputs = false
      viewer.screenSpaceEventHandler.removeInputAction(
        Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
      )

      viewer.screenSpaceEventHandler.setInputAction((click: any) => {
        const picked = viewer.scene.pick(click.position)
        const raw = picked?.id?.id
        if (typeof raw !== 'string') return
        const zoneId = raw.replace(/-(dot|line)$/, '')
        const zone = zonesRef.current[zoneId]
        if (!zone) return
        setFocus(zoneId)
        onFocusChangeRef.current?.(zoneId)
        moveTo(zone.center, ZONE_VIEW.pitch, ZONE_VIEW.range, ZONE_HEADING[zoneId])
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

      viewer.scene.preRender.addEventListener(() => {
        viewer.trackedEntity = undefined
        viewer.selectedEntity = undefined

        const a = animRef.current
        if (a) {
          const k = Math.min((performance.now() - a.start) / a.duration, 1)
          const e = easeInOut(k)
          centerRef.current = Cesium.Cartesian3.lerp(
            a.fromCenter,
            a.toCenter,
            e,
            new Cesium.Cartesian3()
          )
          camRef.current.pitch = a.fromPitch + (a.toPitch - a.fromPitch) * e
          camRef.current.range = a.fromRange + (a.toRange - a.fromRange) * e
          // shortest-path angular lerp so a 350°→10° turn takes the short way, not the long way around
          const headingDiff = ((a.toHeading - a.fromHeading + 540) % 360) - 180
          camRef.current.heading = a.fromHeading + headingDiff * e
          if (k >= 1) animRef.current = null
          apply()
          return
        }

        if (spinningRef.current) {
          camRef.current.heading += 0.05
          apply()
        }
      })

      try {
        const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(2275207)
        if (cancelled) return
        viewer.scene.primitives.add(tileset)
        tilesetRef.current = tileset

        // ---- TILE DETAIL ----
        tileset.maximumScreenSpaceError = SSE_FIXED
        tileset.dynamicScreenSpaceError = false
        tileset.foveatedScreenSpaceError = false
        tileset.preferLeaves = false
        tileset.skipLevelOfDetail = false
        tileset.cacheBytes = 2 * 1024 * 1024 * 1024
        tileset.maximumCacheOverflowBytes = 1024 * 1024 * 1024
      } catch (error) {
        console.log('Error loading tileset:', error)
      }

      const [areas, values] = await Promise.all([
        fetch('/data/areas.geojson').then((r) => r.json()),
        fetch('/data/values.json').then((r) => r.json()),
      ])
      if (cancelled) return

      baseValuesRef.current = values
      const valueById = new Map(values.map((v: any) => [v.areaId, v]))
      // Static (not animated -- the viewer only re-renders on demand, see
      // requestRenderMode above) halo under the single highest-severity
      // zone's marker, so priority is visible on the map itself, not just
      // in the sidebar.
      const maxValue = Math.max(...values.map((v: any) => v.value))

      // Read once at creation, not reactively -- matches the map card's dark
      // background against the current theme without needing to regenerate
      // every billboard on every theme toggle. Dark mode gets a lighter
      // charcoal than light mode's near-black, so the label still reads as
      // "a panel sitting on the map" rather than a void in either theme.
      const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark'
      const cardBg = isDarkTheme ? 'rgba(39,45,37,0.94)' : 'rgba(23,27,22,0.92)'
      cardBgRef.current = cardBg

      for (const feature of areas.features) {
        const v: any = valueById.get(feature.properties.id)
        if (!v) continue

        const id = feature.properties.id
        const [lon, lat] = centroid(feature)
        const color = Cesium.Color.fromBytes(v.color[0], v.color[1], v.color[2])

        zonesRef.current[id] = {
          center: Cesium.Cartesian3.fromDegrees(lon, lat, GROUND),
          cardPosition: Cesium.Cartesian3.fromDegrees(lon, lat, GROUND + CARD_HEIGHT),
          color,
          name: feature.properties.name,
        }

        viewer.entities.add({
          id: `${id}-line`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              lon, lat, GROUND,
              lon, lat, GROUND + CARD_HEIGHT,
            ]),
            width: 6,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.25,
              color: color.withAlpha(0.85),
            }),
          },
        })

        if (v.value === maxValue) {
          viewer.entities.add({
            id: `${id}-halo`,
            position: Cesium.Cartesian3.fromDegrees(lon, lat, GROUND + 1),
            ellipse: {
              semiMinorAxis: 55,
              semiMajorAxis: 55,
              material: color.withAlpha(0.22),
              outline: true,
              outlineColor: color.withAlpha(0.45),
              outlineWidth: 1,
            },
          })
        }

        viewer.entities.add({
          id: `${id}-dot`,
          position: Cesium.Cartesian3.fromDegrees(lon, lat, GROUND + 6),
          point: {
            pixelSize: 13,
            color: color.withAlpha(0.95),
            outlineColor: Cesium.Color.WHITE.withAlpha(0.85),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })

        viewer.entities.add({
          id,
          position: Cesium.Cartesian3.fromDegrees(lon, lat, GROUND + CARD_HEIGHT),
          billboard: {
            image: makeCard(feature.properties.name, v.value, v.label, v.color, cardBg),
            scale: CARD_SCALE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(CARD_NEAR, CARD_NEAR_SCALE, CARD_FAR, CARD_FAR_SCALE),
          },
        })
      }

      applyQuality('3d')
      apply()
      setZonesReady(true)

      // ---- names on the city: neighbourhoods, landmarks, street names ----
      // optional file; runs in the background so a large label set never delays the camera.
      // fires and forgets on purpose — nothing downstream awaits it.
      void loadPlaceLabels()

      async function loadPlaceLabels() {
        try {
          const res = await fetch('/data/places.geojson')
          const places = res.ok ? await res.json() : null

          if (places?.features && !cancelled) {
            const seen = new Set<string>()
            const items: { name: string; kind: string; lon: number; lat: number }[] = []

            for (const f of places.features) {
              const p = f.properties || {}
              const name = p.name
              if (!name || f.geometry?.type !== 'Point') continue

              const kind = p.place ? 'area' : p.highway ? 'street' : 'spot'
              // a long street is many separate pieces in OSM — label it once
              const key = `${kind}:${name}`
              if (kind === 'street' && seen.has(key)) continue
              seen.add(key)

              const [lon, lat] = f.geometry.coordinates
              items.push({ name, kind, lon, lat })
            }

            // searchable straight away -- the clamp below can take a while (it waits on 3D tiles)
            placesRef.current = items as MapPlace[]

            // put each label on the real surface of the 3D city, not at a guessed height
            const positions = items.map((i) => Cesium.Cartesian3.fromDegrees(i.lon, i.lat))
            let onSurface: any[] = []
            try {
              onSurface = await viewer.scene.clampToHeightMostDetailed(positions)
            } catch {
              onSurface = []
            }
            if (cancelled) return

            const STYLE: Record<string, any> = {
              //                       font                               alpha  fades between   height above ground
              area:   { font: '700 15px system-ui, sans-serif', alpha: 1.0,  near: 7000, far: 11000, lift: 45 },
              spot:   { font: '600 12px system-ui, sans-serif', alpha: 0.9,  near: 2400, far: 4200,  lift: 25 },
              street: { font: '500 11px system-ui, sans-serif', alpha: 0.82, near: 1200, far: 2400,  lift: 12 },
            }

            const placed: { label: any; position: any; chars: number; size: number }[] = []

            items.forEach((it, i) => {
              const s = STYLE[it.kind]
              const base = onSurface[i] ?? Cesium.Cartesian3.fromDegrees(it.lon, it.lat, GROUND)
              const carto = Cesium.Cartographic.fromCartesian(base)
              const position = Cesium.Cartesian3.fromRadians(
                carto.longitude,
                carto.latitude,
                carto.height + s.lift
              )

              const entity = viewer.entities.add({
                position,
                label: {
                  text: it.name,
                  font: s.font,
                  fillColor: Cesium.Color.WHITE.withAlpha(s.alpha),
                  outlineColor: Cesium.Color.fromBytes(0, 0, 0, 220),
                  outlineWidth: 4,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                  verticalOrigin: Cesium.VerticalOrigin.CENTER,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                  scaleByDistance: new Cesium.NearFarScalar(600, 1.15, 9000, 0.6),
                  // each kind disappears at its own distance, so the wide shot stays clean
                  translucencyByDistance: new Cesium.NearFarScalar(s.near, 1.0, s.far, 0.0),
                },
              })
              placed.push({ label: entity.label, position, chars: it.name.length, size: parseInt(s.font.split(' ')[1], 10) })
            })

            // A name printed on top of a zone card is unreadable both ways (the card wins visually,
            // the name turns into noise), so names whose screen box touches a card are hidden until
            // the camera moves them apart. Only flips `show` when the answer changes.
            const scratch = new Cesium.Cartesian2()
            const cardScratch = new Cesium.Cartesian2()
            viewer.scene.preRender.addEventListener(() => {
              const cards = Object.values(zonesRef.current)
                .map((z: any) => {
                  const p = viewer.scene.cartesianToCanvasCoordinates(z.cardPosition, cardScratch)
                  if (!p) return null
                  const d = Cesium.Cartesian3.distance(viewer.camera.positionWC, z.cardPosition)
                  const k = Math.min(Math.max((d - CARD_NEAR) / (CARD_FAR - CARD_NEAR), 0), 1)
                  const f = CARD_NEAR_SCALE + (CARD_FAR_SCALE - CARD_NEAR_SCALE) * k
                  const w = CARD_W * 3 * CARD_SCALE * f
                  const h = CARD_H * 3 * CARD_SCALE * f
                  return { x0: p.x - w / 2 - 8, x1: p.x + w / 2 + 8, y0: p.y - h - 8, y1: p.y + 8 }
                })
                .filter(Boolean) as { x0: number; x1: number; y0: number; y1: number }[]

              for (const pl of placed) {
                const p = viewer.scene.cartesianToCanvasCoordinates(pl.position, scratch)
                let hide = false
                if (p) {
                  const half = pl.chars * pl.size * 0.3
                  hide = cards.some((c) => p.x + half > c.x0 && p.x - half < c.x1 && p.y + pl.size / 2 > c.y0 && p.y - pl.size / 2 < c.y1)
                }
                if (pl.label.show !== !hide) pl.label.show = !hide
              }
            })
          }
        } catch {
          // no places file — that's fine
        }
      }
    }

    start()

    return () => {
      cancelled = true
      viewerRef.current = null
      cesiumRef.current = null
      tilesetRef.current = null
      if (viewer && !viewer.isDestroyed()) viewer.destroy()
    }
  }, [])

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { x: e.clientX, y: e.clientY }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    d.x = e.clientX
    d.y = e.clientY
    if (animRef.current) return
    camRef.current.heading -= dx * 0.18
    camRef.current.pitch += dy * 0.15
    apply()
  }
  function onPointerUp() {
    dragRef.current = null
  }
  function onWheel(e: React.WheelEvent) {
    if (animRef.current) return
    camRef.current.range *= Math.exp(e.deltaY * 0.0012)
    apply()
  }

  function applyNudge(patch: { heading?: number; pitch?: number; range?: number }) {
    if (animRef.current) return
    const c = camRef.current
    if (patch.heading) c.heading += patch.heading
    if (patch.pitch) c.pitch += patch.pitch
    if (patch.range) c.range *= patch.range
    apply()
  }

  function toggleSpin() {
    const next = !spinning
    setSpinning(next)
    onSpinningChange?.(next)
    // nothing else kicks off the first frame of the spin loop — request it directly
    viewerRef.current?.scene.requestRender()
  }

  function setZoneValues(values: ZoneValue[] | null) {
    const Cesium = cesiumRef.current
    const viewer = viewerRef.current
    if (!Cesium || !viewer || viewer.isDestroyed() || Object.keys(zonesRef.current).length === 0) {
      return // not built yet; the page repaints once onZonesReady fires
    }
    for (const v of values ?? baseValuesRef.current) {
      const z = zonesRef.current[v.areaId]
      if (!z) continue
      const color = Cesium.Color.fromBytes(v.color[0], v.color[1], v.color[2])
      z.color = color
      const card = viewer.entities.getById(v.areaId)
      const dot = viewer.entities.getById(`${v.areaId}-dot`)
      const line = viewer.entities.getById(`${v.areaId}-line`)
      const key = `${z.name}|${v.value}|${v.label}|${v.color.join(',')}|${cardBgRef.current}`
      if (card?.billboard && paintedCardRef.current[v.areaId] !== key) {
        let url = cardUrlCache.current.get(key)
        if (!url) {
          url = makeCard(z.name, v.value, v.label, v.color, cardBgRef.current).toDataURL('image/png')
          cardUrlCache.current.set(key, url)
        }
        card.billboard.image = url
        paintedCardRef.current[v.areaId] = key
      }
      if (dot?.point) dot.point.color = color.withAlpha(0.95)
      if (line?.polyline) {
        line.polyline.material = new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.25, color: color.withAlpha(0.85) })
      }
    }
    styleFocus(focus) // keeps the selected zone's halo in its (possibly new) colour
    viewer.scene.requestRender()
  }

  // Marker size follows the selection: chosen zone big, the rest small, all equal when none is chosen.
  function dotSize(zoneId: string) {
    return focus === null ? 13 : zoneId === focus ? 22 : 10
  }

  // Choosing a zone is a whole-scene change, not just a camera move: the others recede, the
  // chosen one gets a larger marker, a bigger card and a soft halo on the ground.
  function styleFocus(zoneId: string | null) {
    const Cesium = cesiumRef.current
    const viewer = viewerRef.current
    if (!Cesium || !viewer || viewer.isDestroyed()) return
    viewer.entities.removeById('focus-halo')
    for (const id of Object.keys(zonesRef.current)) {
      const active = zoneId === id
      const card = viewer.entities.getById(id)
      const dot = viewer.entities.getById(`${id}-dot`)
      const line = viewer.entities.getById(`${id}-line`)
      if (card?.billboard) {
        card.billboard.color = zoneId === null || active ? Cesium.Color.WHITE : Cesium.Color.WHITE.withAlpha(0.32)
        card.billboard.scale = active ? CARD_SCALE * 1.18 : CARD_SCALE
      }
      if (dot?.point) {
        dot.point.pixelSize = zoneId === null ? 13 : active ? 22 : 10
        dot.point.outlineWidth = active ? 4 : 2
      }
      if (line?.polyline) line.polyline.show = zoneId === null || active
    }
    if (zoneId) {
      const z = zonesRef.current[zoneId]
      if (z) {
        viewer.entities.add({
          id: 'focus-halo',
          position: z.center,
          ellipse: {
            semiMinorAxis: 130,
            semiMajorAxis: 130,
            material: z.color.withAlpha(0.2),
            outline: true,
            outlineColor: z.color.withAlpha(0.7),
            outlineWidth: 2,
            height: 0,
          },
        })
      }
    }
    viewer.scene.requestRender()
  }

  function highlightZone(zoneId: string | null) {
    const viewer = viewerRef.current
    if (!viewer) return
    const prevId = highlightedZoneRef.current
    if (prevId) {
      const prevDot = viewer.entities.getById(`${prevId}-dot`)
      if (prevDot?.point) {
        prevDot.point.pixelSize = dotSize(prevId)
        prevDot.point.outlineWidth = prevId === focus ? 4 : 2
      }
    }
    highlightedZoneRef.current = zoneId
    if (zoneId) {
      const dot = viewer.entities.getById(`${zoneId}-dot`)
      if (dot?.point) {
        dot.point.pixelSize = 22
        dot.point.outlineWidth = 4
      }
    }
    viewer.scene.requestRender()
  }

  function searchPlaces(query: string, limit = 6): MapPlace[] {
    const q = fold(query.trim())
    if (!q) return []
    const scored: { place: MapPlace; rank: number }[] = []
    for (const place of placesRef.current) {
      const name = fold(place.name)
      const at = name.indexOf(q)
      if (at === -1) continue
      // names starting with the text, then words starting with it, then anything containing it
      const rank = at === 0 ? 0 : name[at - 1] === ' ' ? 1 : 2
      scored.push({ place, rank })
    }
    return scored
      .sort((a, b) => a.rank - b.rank || a.place.name.localeCompare(b.place.name))
      .slice(0, limit)
      .map((s) => s.place)
  }

  function clearPlaceMarker() {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return
    viewer.entities.removeById('search-marker')
    viewer.scene.requestRender()
  }

  function flyToPlace(place: MapPlace) {
    const Cesium = cesiumRef.current
    const viewer = viewerRef.current
    if (!Cesium || !viewer || viewer.isDestroyed() || !centerRef.current) return

    viewer.entities.removeById('search-marker')
    viewer.entities.add({
      id: 'search-marker',
      position: Cesium.Cartesian3.fromDegrees(place.lon, place.lat, GROUND + 6),
      point: {
        pixelSize: 16,
        color: Cesium.Color.fromCssColorString('#3B82F6'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: place.name,
        font: '700 14px system-ui, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromBytes(0, 0, 0, 230),
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -16),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })

    if (focus !== null) {
      setFocus(null)
      onFocusChangeRef.current?.(null)
    }
    moveTo(
      Cesium.Cartesian3.fromDegrees(place.lon, place.lat, GROUND),
      mode === 'map' ? MAP_VIEW.pitch : PLACE_VIEW.pitch,
      mode === 'map' ? PLACE_VIEW.mapRange : PLACE_VIEW.range
    )
  }

  // Exposes the same actions the built-in chrome uses, for an embedding page
  // rendering its own controls with `hideChrome`. Re-created every render
  // (no deps array) so it never closes over stale `mode`/`focus` state.
  useImperativeHandle(ref, () => ({
    nudge: applyNudge,
    switchMode,
    goHome,
    toggleSpin,
    resetNorth: () => {
      camRef.current.heading = 0
      apply()
    },
    highlightZone,
    getHeading: () => camRef.current.heading,
    searchPlaces,
    flyToPlace,
    clearPlaceMarker,
    setZoneValues,
  }))

  const goHome = () => {
    const Cesium = cesiumRef.current
    if (!Cesium) return
    clearPlaceMarker()
    setFocus(null)
    onFocusChangeRef.current?.(null)
    moveTo(
      Cesium.Cartesian3.fromDegrees(CITY.lon, CITY.lat, CITY.height),
      mode === 'map' ? MAP_VIEW.pitch : HOME.pitch,
      mode === 'map' ? MAP_VIEW.range : HOME.range
    )
  }

  // Controlled fly-to from outside (e.g. a sidebar zone list). `focusZone`
  // left as `undefined` (its default) means "uncontrolled" -- the plain
  // `<CityMap />` usage on the homepage never runs this effect at all.
  useEffect(() => {
    if (focusZone === undefined) return
    if (focusZone === null) {
      if (focus !== null) goHome()
      return
    }
    if (!zonesReady || focus === focusZone) return
    const zone = zonesRef.current[focusZone]
    if (!zone) return
    setFocus(focusZone)
    moveTo(zone.center, ZONE_VIEW.pitch, ZONE_VIEW.range, ZONE_HEADING[focusZone])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusZone, zonesReady])

  useEffect(() => {
    if (zonesReady) onZonesReadyRef.current?.()
  }, [zonesReady])

  useEffect(() => {
    if (zonesReady) styleFocus(focus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, zonesReady])

  const btn: React.CSSProperties = {
    width: 38,
    height: 38,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 9,
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(10,14,20,0.72)',
    backdropFilter: 'blur(10px)',
    color: 'white',
    font: '500 15px system-ui, -apple-system, sans-serif',
    cursor: 'pointer',
    userSelect: 'none',
  }
  const wide: React.CSSProperties = { ...btn, width: 'auto', padding: '0 16px' }

  return (
    // 'absolute' (not 'fixed') so this fills whatever positioned container it's
    // placed in -- a full-viewport wrapper on the homepage, or a bounded rounded
    // panel in the Command Center. Sizes against the viewport either way when no
    // positioned ancestor exists, so the plain `<CityMap />` homepage usage is unaffected.
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      />

      {!hideChrome && (
        <>
          <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, display: 'flex', gap: 8 }}>
            <button onClick={goHome} style={wide}>
              {focus ? '← Pamja e plotë' : 'Pamja e plotë'}
            </button>

            <div
              style={{
                display: 'flex',
                gap: 4,
                padding: 4,
                borderRadius: 11,
                background: 'rgba(10,14,20,0.72)',
                border: '1px solid rgba(255,255,255,0.18)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <button
                onClick={() => switchMode('3d')}
                style={{ ...wide, height: 30, border: 'none', background: mode === '3d' ? 'rgba(59,130,246,0.55)' : 'transparent' }}
              >
                3D
              </button>
              <button
                onClick={() => switchMode('map')}
                style={{ ...wide, height: 30, border: 'none', background: mode === 'map' ? 'rgba(59,130,246,0.55)' : 'transparent' }}
              >
                Hartë
              </button>
            </div>
          </div>

          <div style={{ position: 'absolute', right: 22, bottom: 60, zIndex: 10, display: 'grid', gap: 8, justifyItems: 'center' }}>
            <button onClick={() => applyNudge({ pitch: 6 })} style={btn}>↑</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => applyNudge({ heading: -15 })} style={btn}>↺</button>
              <button onClick={() => applyNudge({ pitch: -6 })} style={btn}>↓</button>
              <button onClick={() => applyNudge({ heading: 15 })} style={btn}>↻</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => applyNudge({ range: 1.25 })} style={btn}>−</button>
              <button onClick={() => applyNudge({ range: 0.8 })} style={btn}>+</button>
            </div>
            <button
              onClick={toggleSpin}
              style={{ ...wide, marginTop: 4, background: spinning ? 'rgba(59,130,246,0.5)' : btn.background }}
            >
              {spinning ? '❚❚' : '▶'}
            </button>
          </div>

          <div style={{ position: 'absolute', bottom: 40, left: 20, zIndex: 10, color: 'rgba(255,255,255,0.8)', font: '400 12px system-ui, sans-serif', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
            Click a zone to fly to it · Drag to rotate · Scroll to zoom
          </div>
        </>
      )}
    </div>
  )
})