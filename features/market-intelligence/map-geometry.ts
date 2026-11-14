// The map's arithmetic: projecting a coordinate, framing an area, clustering markers and sizing the scale bar.
// Pure: no directive, so unit tests load it.

import { MAP_PROJECTION, PROVINCE_SHAPES } from './province-shapes.ts'

/** A pan and zoom: a map point (x, y) is drawn at screen (x * k + view.x, y * k + view.y). */
export type View = { k: number; x: number; y: number }
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

/** Longitude and latitude to the map's own units (the same projection the province shapes were drawn in). */
export function project(longitude: number, latitude: number) {
  return {
    x: (longitude - MAP_PROJECTION.lon0) * MAP_PROJECTION.cosLat * MAP_PROJECTION.scale,
    y: (MAP_PROJECTION.lat0 - latitude) * MAP_PROJECTION.scale,
  }
}

/** The view that fits an area inside the frame with some padding, never zoomed in further than maxK. */
export function fitView(bounds: Bounds, size: { width: number; height: number }, padding = 24, maxK = Infinity): View {
  const width = Math.max(bounds.maxX - bounds.minX, 0)
  const height = Math.max(bounds.maxY - bounds.minY, 0)
  const room = { width: Math.max(size.width - padding * 2, 1), height: Math.max(size.height - padding * 2, 1) }
  const k = Math.min(maxK, width ? room.width / width : Infinity, height ? room.height / height : Infinity)
  const scale = Number.isFinite(k) ? k : 1
  const centreX = (bounds.minX + bounds.maxX) / 2
  const centreY = (bounds.minY + bounds.maxY) / 2
  return { k: scale, x: size.width / 2 - centreX * scale, y: size.height / 2 - centreY * scale }
}

const boundsCache = new Map<string, Bounds>()
/** The rectangle around a province's outline. */
export function provinceBounds(name: string): Bounds | null {
  const cached = boundsCache.get(name)
  if (cached) return cached
  const shape = PROVINCE_SHAPES.find((item) => item.name === name)
  if (!shape) return null
  const numbers = shape.d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (let at = 0; at + 1 < numbers.length; at += 2) {
    bounds.minX = Math.min(bounds.minX, numbers[at]); bounds.maxX = Math.max(bounds.maxX, numbers[at])
    bounds.minY = Math.min(bounds.minY, numbers[at + 1]); bounds.maxY = Math.max(bounds.maxY, numbers[at + 1])
  }
  boundsCache.set(name, bounds)
  return bounds
}

export type Cluster<T> = { key: string; x: number; y: number; members: T[] }

/**
 * Groups points that would be drawn within `cell` screen pixels of each other. A group of one is a marker; a larger
 * group is a cluster drawn at the average position of its members. Points off screen are left out.
 */
export function clusterPoints<T extends { x: number; y: number }>(points: T[], view: View, cell: number, size?: { width: number; height: number }): Cluster<T>[] {
  const groups = new Map<string, { sumX: number; sumY: number; members: T[] }>()
  for (const point of points) {
    const screenX = point.x * view.k + view.x
    const screenY = point.y * view.k + view.y
    if (size && (screenX < -cell || screenY < -cell || screenX > size.width + cell || screenY > size.height + cell)) continue
    const key = `${Math.floor(screenX / cell)}:${Math.floor(screenY / cell)}`
    const group = groups.get(key)
    if (group) { group.sumX += screenX; group.sumY += screenY; group.members.push(point) }
    else groups.set(key, { sumX: screenX, sumY: screenY, members: [point] })
  }
  return [...groups].map(([key, group]) => ({ key, x: group.sumX / group.members.length, y: group.sumY / group.members.length, members: group.members }))
}

// One map unit is a hundredth of a degree of latitude: about 1.11 km.
const KM_PER_UNIT = 1.1132
const STEPS = [5, 10, 25, 50, 100, 250, 500, 1000]

/** A scale bar about 100 pixels long, at a round number of kilometres. */
export function scaleBar(k: number) {
  const kmPerPixel = KM_PER_UNIT / k
  const km = STEPS.reduce((best, step) => (Math.abs(step / kmPerPixel - 100) < Math.abs(best / kmPerPixel - 100) ? step : best), STEPS[0])
  return { km, pixels: Math.round(km / kmPerPixel) }
}
