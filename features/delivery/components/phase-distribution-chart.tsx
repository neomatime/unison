'use client'

import { useId, useState } from 'react'

// From overview-bands, not the query module: the query is `server-only`, and
// HEALTH_BANDS is a runtime value, so importing it from there pulls next/headers
// into the client bundle and the build fails.
import { HEALTH_BANDS, type HealthBand, type PhaseColumn } from '../overview-bands'

/**
 * Health is a status scale, not a categorical one, so the four fills are ordered
 * good to critical and always stack in that order — risk therefore sits at the
 * top of every column and the eye can read the risk line straight across.
 *
 * Values are the OKLCH tokens resolved to hex: success, warning, danger, and a
 * deeper danger step for Critical. Validated as a set before use — the amber
 * falls below 3:1 against the white surface, which is why every column carries a
 * printed total and each segment is separated by a 2px surface gap rather than
 * relying on fill alone to be legible.
 */
const BAND_FILL: Record<HealthBand, string> = {
  'On track': '#26914d',
  Watch: '#e4a249',
  'At Risk': '#db4241',
  Critical: '#9e141e',
}

type Hovered = { column: PhaseColumn; x: number; y: number } | null

export function PhaseDistributionChart({ columns, frameworkName }: { columns: PhaseColumn[]; frameworkName: string }) {
  const [hovered, setHovered] = useState<Hovered>(null)
  const headingId = useId()

  const peak = Math.max(...columns.map((column) => column.total), 1)
  // A little headroom so the tallest column never touches the plot ceiling.
  const scale = (value: number) => (value / (peak * 1.15)) * 100

  return (
    <figure className="m-0" aria-labelledby={headingId}>
      <figcaption id={headingId} className="sr-only">
        Active projects by {frameworkName} phase, segmented by delivery health
      </figcaption>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 pt-1 pb-5">
        {HEALTH_BANDS.map((band) => (
          <span key={band} className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: BAND_FILL[band] }} />
            {band}
          </span>
        ))}
      </div>

      <div className="relative px-5 pb-5">
        <div className="flex h-56 items-end gap-2 sm:gap-3">
          {columns.map((column) => (
            <div
              key={column.phase}
              className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
              onMouseEnter={(event) =>
                setHovered({ column, x: event.currentTarget.offsetLeft, y: event.currentTarget.offsetTop })
              }
              onMouseLeave={() => setHovered(null)}
            >
              <p className="mb-1.5 text-center text-xs font-semibold tabular-nums text-foreground">
                {column.total > 0 ? column.total : <span className="text-muted-foreground">—</span>}
              </p>

              {column.total === 0 ? (
                // An empty phase is information, so it keeps its slot and shows a
                // baseline rather than disappearing from the axis.
                <div className="h-px w-full rounded-full bg-border" />
              ) : (
                <div className="flex w-full flex-col justify-end gap-0.5" style={{ height: `${scale(column.total)}%` }}>
                  {HEALTH_BANDS.filter((band) => column.counts[band] > 0)
                    .reverse()
                    .map((band, index) => (
                      <div
                        key={band}
                        className={index === 0 ? 'rounded-t-[4px]' : undefined}
                        style={{
                          background: BAND_FILL[band],
                          flexGrow: column.counts[band],
                          minHeight: '3px',
                        }}
                      />
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-2 border-t border-border pt-3 sm:gap-3">
          {columns.map((column) => (
            <p
              key={column.phase}
              className="min-w-0 flex-1 text-center text-[0.6875rem] leading-tight font-medium break-words text-muted-foreground"
            >
              {column.phase}
            </p>
          ))}
        </div>

        {hovered && hovered.column.total > 0 ? (
          <div
            role="status"
            className="pointer-events-none absolute z-20 w-44 rounded-lg border border-border bg-card p-3 shadow-lg"
            style={{ left: Math.max(0, hovered.x - 60), bottom: '5.5rem' }}
          >
            <p className="text-xs font-semibold text-foreground">{hovered.column.phase}</p>
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
              {hovered.column.total} {hovered.column.total === 1 ? 'project' : 'projects'}
            </p>
            <div className="mt-2 space-y-1">
              {HEALTH_BANDS.filter((band) => hovered.column.counts[band] > 0).map((band) => (
                <p key={band} className="flex items-center justify-between gap-2 text-[0.6875rem]">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: BAND_FILL[band] }} />
                    {band}
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">{hovered.column.counts[band]}</span>
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </figure>
  )
}
