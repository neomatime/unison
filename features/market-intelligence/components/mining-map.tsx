'use client'

import { LocateFixed, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { STATUS_COLORS, STATUS_LABELS, type EngagementStatus, type MarketOperation } from '../model'
import { clusterPoints, fitView, project, provinceBounds, scaleBar, type View } from '../map-geometry'
import { BOUNDARY_ATTRIBUTION, MAP_HEIGHT, MAP_WIDTH, PROVINCE_SHAPES } from '../province-shapes'

// Where each province's name sits (longitude, latitude): near the middle of the province, clear of its neighbours.
const PROVINCE_LABELS: Array<[string, number, number]> = [
  ['Limpopo', 29.3, -23.7], ['Mpumalanga', 30.4, -25.7], ['Gauteng', 28.2, -26.15], ['North West', 25.7, -26.5],
  ['Free State', 26.6, -28.6], ['KwaZulu-Natal', 30.8, -28.8], ['Northern Cape', 21.6, -29.4], ['Eastern Cape', 26.2, -32.2],
  ['Western Cape', 20.7, -33.2],
]

const MIN_ZOOM_FACTOR = 0.8
const MAX_ZOOM_FACTOR = 40

export type MiningMapProps = {
  operations: MarketOperation[]
  statusOf: (operation: MarketOperation) => EngagementStatus
  organizationName: (operation: MarketOperation) => string
  selectedId: string | null
  onSelect: (operation: MarketOperation) => void
  /** The province the filters are on, so the map frames it. */
  province: string
  /** Changes whenever the filters change, so the map reframes what is left. */
  frameKey: string
  className?: string
  emptyMessage?: string
}

/**
 * South Africa with its nine provinces and every mapped mining operation. Drawn as SVG from real boundaries, with pan
 * (drag), zoom (wheel, buttons), reset, and markers that merge into numbered clusters until there is room to show them.
 */
export function MiningMap({ operations, statusOf, organizationName, selectedId, onSelect, province, frameKey, className, emptyMessage }: MiningMapProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<View | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null)

  useEffect(() => {
    const element = frameRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const points = useMemo(() => operations.map((operation) => ({ operation, ...project(operation.longitude, operation.latitude) })), [operations])
  const home = useMemo(() => (size.width && size.height ? fitView({ minX: 0, minY: 0, maxX: MAP_WIDTH, maxY: MAP_HEIGHT }, size) : null), [size])

  // Frame what the filters leave: the chosen province, or the filtered sites, or the whole country.
  // frameKey is empty when no filter is on: then the map shows the whole country.
  useEffect(() => {
    if (!size.width || !size.height) return
    const bounds = province ? provinceBounds(province) : frameKey && points.length ? boundsOf(points) : null
    setView(bounds && home ? fitView(bounds, size, 60, home.k * 12) : home)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reframe when the filters or the frame size change, not on every data refresh
  }, [frameKey, province, size.width, size.height])

  const current = view ?? home
  const zoomBy = useCallback((factor: number, at?: { x: number; y: number }) => {
    setView((previous) => {
      const base = previous ?? home
      if (!base || !home) return previous
      const k = Math.min(home.k * MAX_ZOOM_FACTOR, Math.max(home.k * MIN_ZOOM_FACTOR, base.k * factor))
      const point = at ?? { x: size.width / 2, y: size.height / 2 }
      const ratio = k / base.k
      return { k, x: point.x - (point.x - base.x) * ratio, y: point.y - (point.y - base.y) * ratio }
    })
  }, [home, size])

  // The wheel zooms around the pointer. Added by hand so it can stop the page from scrolling.
  useEffect(() => {
    const element = frameRef.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const box = element.getBoundingClientRect()
      zoomBy(event.deltaY < 0 ? 1.25 : 0.8, { x: event.clientX - box.left, y: event.clientY - box.top })
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [zoomBy])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!current || event.button !== 0 || (event.target as Element).closest('[data-map-control]')) return
    drag.current = { x: event.clientX, y: event.clientY, view: current, moved: false }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!start.moved && Math.hypot(dx, dy) < 4) return
    if (!start.moved) { start.moved = true; event.currentTarget.setPointerCapture(event.pointerId) }
    setView({ ...start.view, x: start.view.x + dx, y: start.view.y + dy })
  }
  const onPointerUp = () => { drag.current = null }

  const clusters = useMemo(() => (current ? clusterPoints(points, current, 36, size) : []), [points, current, size])
  const scale = current ? scaleBar(current.k) : null
  const hoveredPoint = hovered ? clusters.find((cluster) => cluster.members.length === 1 && cluster.members[0].operation.id === hovered) : null

  return (
    <div
      ref={frameRef}
      className={cn('relative touch-none select-none overflow-hidden bg-card', drag.current?.moved ? 'cursor-grabbing' : 'cursor-grab', className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {current ? (
        <svg width={size.width} height={size.height} className="block" role="img" aria-label={`Map of South Africa showing ${operations.length} mining operation${operations.length === 1 ? '' : 's'}`}>
          <g transform={`translate(${current.x} ${current.y}) scale(${current.k})`}>
            {PROVINCE_SHAPES.map((shape) => (
              <path
                key={shape.name}
                d={shape.d}
                fillRule="evenodd"
                fill={province === shape.name ? 'var(--market-land-active)' : 'var(--market-land)'}
                stroke={province === shape.name ? 'var(--brand)' : 'var(--market-border)'}
                strokeWidth={province === shape.name ? 1.4 : 0.8}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
          {PROVINCE_LABELS.map(([name, lon, lat]) => {
            const point = project(lon, lat)
            return (
              <text key={name} x={current.x + point.x * current.k} y={current.y + point.y * current.k} textAnchor="middle" className="pointer-events-none fill-[var(--briefing-muted)] text-[10px] font-medium uppercase tracking-[0.12em]">
                {name}
              </text>
            )
          })}
          {clusters.map((cluster) => {
            if (cluster.members.length === 1) {
              const { operation } = cluster.members[0]
              const status = statusOf(operation)
              const selected = operation.id === selectedId
              return (
                <g
                  key={operation.id}
                  data-map-control
                  role="button"
                  tabIndex={0}
                  aria-label={`${operation.name}, ${organizationName(operation)}, ${operation.province}. ${STATUS_LABELS[status]}.`}
                  aria-pressed={selected}
                  className="cursor-pointer outline-none [&:focus-visible>circle:last-child]:stroke-[var(--brand)]"
                  onClick={() => onSelect(operation)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(operation) } }}
                  onPointerEnter={() => setHovered(operation.id)}
                  onPointerLeave={() => setHovered((value) => (value === operation.id ? null : value))}
                  onFocus={() => setHovered(operation.id)}
                  onBlur={() => setHovered(null)}
                >
                  {selected ? <circle cx={cluster.x} cy={cluster.y} r={9} fill="none" stroke="var(--foreground)" strokeWidth={1.5} /> : null}
                  <circle cx={cluster.x} cy={cluster.y} r={selected ? 5.5 : 4.5} fill={STATUS_COLORS[status]} stroke="var(--card)" strokeWidth={1.2} />
                </g>
              )
            }
            const label = cluster.members.length > 999 ? `${Math.round(cluster.members.length / 100) / 10}k` : String(cluster.members.length)
            const radius = Math.min(20, 10 + Math.log10(cluster.members.length) * 4)
            return (
              <g
                key={cluster.key}
                data-map-control
                role="button"
                tabIndex={0}
                aria-label={`${cluster.members.length} mining operations. Zoom in to separate them.`}
                className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-[var(--foreground)]"
                onClick={() => size.width && setView(fitView(boundsOf(cluster.members), size, 80, current.k * 2.5))}
                onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && size.width) { event.preventDefault(); setView(fitView(boundsOf(cluster.members), size, 80, current.k * 2.5)) } }}
              >
                <circle cx={cluster.x} cy={cluster.y} r={radius} fill="var(--card)" fillOpacity={0.92} stroke="var(--brand)" strokeWidth={1.2} />
                <text x={cluster.x} y={cluster.y} dy="0.35em" textAnchor="middle" className="pointer-events-none fill-foreground text-[10px] font-semibold tabular-nums">{label}</text>
              </g>
            )
          })}
        </svg>
      ) : null}

      {hoveredPoint ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-[var(--shadow-overlay)]"
          style={{ left: hoveredPoint.x, top: hoveredPoint.y + 12 }}
        >
          <p className="font-semibold text-foreground">{hoveredPoint.members[0].operation.name}</p>
          <p className="mt-0.5 text-[var(--briefing-muted)]">{organizationName(hoveredPoint.members[0].operation)}</p>
          <p className="mt-1.5 text-[var(--briefing-muted)]">
            {hoveredPoint.members[0].operation.province}
            {hoveredPoint.members[0].operation.primaryCommodity ? ` · ${hoveredPoint.members[0].operation.primaryCommodity}` : ''}
          </p>
          <p className="mt-1 flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: STATUS_COLORS[statusOf(hoveredPoint.members[0].operation)] }} />
            {STATUS_LABELS[statusOf(hoveredPoint.members[0].operation)]}
          </p>
        </div>
      ) : null}

      {emptyMessage ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit max-w-[80%] -translate-y-1/2 border border-border bg-card/95 px-4 py-3 text-center text-sm text-[var(--briefing-muted)]">
          {emptyMessage}
        </div>
      ) : null}

      <div className="absolute left-3 top-3 flex flex-col border border-border bg-card" data-map-control>
        <MapButton label="Zoom in" onClick={() => zoomBy(1.5)}><Plus className="size-4" aria-hidden="true" /></MapButton>
        <MapButton label="Zoom out" onClick={() => zoomBy(1 / 1.5)}><Minus className="size-4" aria-hidden="true" /></MapButton>
        <MapButton label="Reset to South Africa" onClick={() => setView(home)}><LocateFixed className="size-4" aria-hidden="true" /></MapButton>
      </div>

      {scale ? (
        <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-[var(--briefing-muted)]">
          <div className="border-x border-b border-[var(--briefing-muted)]" style={{ width: scale.pixels, height: 5 }} />
          <span>{scale.km} km</span>
        </div>
      ) : null}
      <p className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-[var(--briefing-muted)]">{BOUNDARY_ATTRIBUTION}</p>
    </div>
  )
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center border-b border-border text-muted-foreground outline-none last:border-b-0 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      {children}
    </button>
  )
}

function boundsOf(points: Array<{ x: number; y: number }>) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y)
  }
  return { minX, minY, maxX, maxY }
}
