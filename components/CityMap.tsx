'use client'

import { useEffect, useRef, useState } from 'react'
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

function makeCard(name: string, value: number, status: string, color: number[]) {
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
  ctx.roundRect(1, 1, w - 2, h - 2, 14)
  ctx.fillStyle = 'rgba(11,15,21,0.88)'
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

const CITY = { lon: 20.0822, lat: 41.1125, height: 120 }
const HOME = { pitch: -32, range: 4500 }
const ZONE_VIEW = { pitch: -38, range: 2000 }
const MAP_VIEW = { pitch: -89, range: 6500 }

const LIMITS = { minPitch: -89, maxPitch: -14, minRange: 260, maxRange: 12000 }
const MIN_ALTITUDE = 160

// ---- the one dial for 3D quality vs speed ----
// 1.0 = fastest and softest · 1.5 = balanced · 2.0 = sharpest and slowest
const SHARPNESS_3D = 2.0

// ---- tile detail: relaxed when the whole city is in frame, tight once zoomed into a district ----
// Asking for low error across the full city at once floods the tile scheduler and never settles.
// Restricting that to whatever's actually in a close-up view lets it safely go much sharper.
const SSE_WIDE = 8
const SSE_CLOSE = 2
const SSE_ENTER_CLOSE = 2200 // range below this switches to CLOSE
const SSE_EXIT_CLOSE = 2800 // range above this switches back to WIDE (gap avoids flicker)

function easeInOut(k: number) {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
}

export default function CityMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const cesiumRef = useRef<any>(null)
  const tilesetRef = useRef<any>(null)

  const centerRef = useRef<any>(null)
  const camRef = useRef({ heading: 40, pitch: HOME.pitch, range: HOME.range })
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const animRef = useRef<any>(null)
  const zonesRef = useRef<Record<string, any>>({})
  const sseModeRef = useRef<'wide' | 'close'>('wide')

  const [spinning, setSpinning] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
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

    const tileset = tilesetRef.current
    if (tileset) {
      if (sseModeRef.current === 'wide' && c.range < SSE_ENTER_CLOSE) {
        sseModeRef.current = 'close'
      } else if (sseModeRef.current === 'close' && c.range > SSE_EXIT_CLOSE) {
        sseModeRef.current = 'wide'
      }
      const wantSSE = sseModeRef.current === 'close' ? SSE_CLOSE : SSE_WIDE
      if (tileset.maximumScreenSpaceError !== wantSSE) {
        tileset.maximumScreenSpaceError = wantSSE
      }
    }

    viewer.camera.lookAt(
      centerRef.current,
      new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(c.heading),
        Cesium.Math.toRadians(c.pitch),
        c.range
      )
    )
  }

  function moveTo(targetCenter: any, pitch: number, range: number) {
    animRef.current = {
      start: performance.now(),
      duration: 1100,
      fromCenter: centerRef.current.clone(),
      toCenter: targetCenter.clone(),
      fromPitch: camRef.current.pitch,
      toPitch: pitch,
      fromRange: camRef.current.range,
      toRange: range,
    }
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
        moveTo(zone.center, ZONE_VIEW.pitch, ZONE_VIEW.range)
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
        // maximumScreenSpaceError is kept adaptive: apply() switches it between
        // SSE_WIDE and SSE_CLOSE based on zoom, so the full-city view stays fast
        // while a close-up district can pull in the sharpest detail available.
        tileset.maximumScreenSpaceError = SSE_WIDE
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

      const valueById = new Map(values.map((v: any) => [v.areaId, v]))

      for (const feature of areas.features) {
        const v: any = valueById.get(feature.properties.id)
        if (!v) continue

        const id = feature.properties.id
        const [lon, lat] = centroid(feature)
        const color = Cesium.Color.fromBytes(v.color[0], v.color[1], v.color[2])

        zonesRef.current[id] = {
          center: Cesium.Cartesian3.fromDegrees(lon, lat, GROUND),
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
            image: makeCard(feature.properties.name, v.value, v.label, v.color),
            scale: 1 / 3,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(1500, 0.5, 12000, 0.28),
          },
        })
      }

      applyQuality('3d')
      apply()

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

            items.forEach((it, i) => {
              const s = STYLE[it.kind]
              const base = onSurface[i] ?? Cesium.Cartesian3.fromDegrees(it.lon, it.lat, GROUND)
              const carto = Cesium.Cartographic.fromCartesian(base)
              const position = Cesium.Cartesian3.fromRadians(
                carto.longitude,
                carto.latitude,
                carto.height + s.lift
              )

              viewer.entities.add({
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

  const nudge = (patch: { heading?: number; pitch?: number; range?: number }) => () => {
    if (animRef.current) return
    const c = camRef.current
    if (patch.heading) c.heading += patch.heading
    if (patch.pitch) c.pitch += patch.pitch
    if (patch.range) c.range *= patch.range
    apply()
  }

  const goHome = () => {
    const Cesium = cesiumRef.current
    if (!Cesium) return
    setFocus(null)
    moveTo(
      Cesium.Cartesian3.fromDegrees(CITY.lon, CITY.lat, CITY.height),
      mode === 'map' ? MAP_VIEW.pitch : HOME.pitch,
      mode === 'map' ? MAP_VIEW.range : HOME.range
    )
  }

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
    <div style={{ position: 'fixed', inset: 0 }}>
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      />

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
        <button onClick={nudge({ pitch: 6 })} style={btn}>↑</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={nudge({ heading: -15 })} style={btn}>↺</button>
          <button onClick={nudge({ pitch: -6 })} style={btn}>↓</button>
          <button onClick={nudge({ heading: 15 })} style={btn}>↻</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={nudge({ range: 1.25 })} style={btn}>−</button>
          <button onClick={nudge({ range: 0.8 })} style={btn}>+</button>
        </div>
        <button
          onClick={() => setSpinning((s) => !s)}
          style={{ ...wide, marginTop: 4, background: spinning ? 'rgba(59,130,246,0.5)' : btn.background }}
        >
          {spinning ? '❚❚' : '▶'}
        </button>
      </div>

      <div style={{ position: 'absolute', bottom: 40, left: 20, zIndex: 10, color: 'rgba(255,255,255,0.8)', font: '400 12px system-ui, sans-serif', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
        Click a zone to fly to it · Drag to rotate · Scroll to zoom
      </div>
    </div>
  )
}