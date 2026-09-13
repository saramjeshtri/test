'use client'

import { useEffect, useRef } from 'react'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// middle point of a polygon = average of its corners
function centroid(feature: any): [number, number] {
  const ring = feature.geometry.coordinates[0]
  const pts = ring.slice(0, -1)
  let x = 0
  let y = 0
  for (const [lon, lat] of pts) {
    x += lon
    y += lat
  }
  return [x / pts.length, y / pts.length]
}

const GROUND = 100 // rough height of Elbasan above sea level, in metres

export default function CityMap() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let viewer: any
    let cancelled = false

    async function start() {
      ;(window as any).CESIUM_BASE_URL = '/cesium'
      const Cesium = await import('cesium')
      if (cancelled || !containerRef.current) return

      Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_TOKEN as string

      viewer = new Cesium.Viewer(containerRef.current, {
        globe: false,
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

      try {
        const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(2275207)
        if (cancelled) return
        viewer.scene.primitives.add(tileset)
      } catch (error) {
        console.log('Error loading tileset:', error)
      }

      // --- our data ---
      const [areas, values] = await Promise.all([
        fetch('/data/areas.geojson').then((r) => r.json()),
        fetch('/data/values.json').then((r) => r.json()),
      ])
      if (cancelled) return

      const valueById = new Map(values.map((v: any) => [v.areaId, v]))

      for (const feature of areas.features) {
        const v: any = valueById.get(feature.properties.id)
        if (!v) continue

        const [lon, lat] = centroid(feature)
        const height = 150 + (v.value / 100) * 650

        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, GROUND + height / 2),
          cylinder: {
            length: height,
            topRadius: 70,
            bottomRadius: 70,
            material: Cesium.Color.fromBytes(v.color[0], v.color[1], v.color[2], 170),
            outline: false,
          },
        })
      }

      viewer.scene.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(20.0620, 41.0930, 2000),
        orientation: {
          heading: Cesium.Math.toRadians(42),
          pitch: Cesium.Math.toRadians(-28),
        },
      })
    }

    start()

    return () => {
      cancelled = true
      if (viewer && !viewer.isDestroyed()) viewer.destroy()
    }
  }, [])

  return <div ref={containerRef} style={{ position: 'fixed', inset: 0 }} />
}