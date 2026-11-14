const fs = require('fs')
const [,, input, output] = process.argv
const g = JSON.parse(fs.readFileSync(input, 'utf8'))
const LON0 = 16.3, LAT0 = -22.0, K = 100, COS = Math.cos(29 * Math.PI / 180)
const proj = ([lon, lat]) => [(lon - LON0) * COS * K, (LAT0 - lat) * K]
function dp(pts, tol) {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop(); let max = 0, idx = -1
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len; if (d > max) { max = d; idx = i } }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]) }
  }
  return pts.filter((_, i) => keep[i])
}
const names = { 'Nothern Cape': 'Northern Cape' }
const out = g.features.map((f) => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  const d = polys.map((poly) => poly.map((ring) => {
    const all = ring.map(proj); const mid = Math.floor(all.length / 2)
    const pts = [...dp(all.slice(0, mid + 1), 0.6).slice(0, -1), ...dp(all.slice(mid), 0.6)].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])
    if (pts.length < 4) return ''
    return 'M' + pts.map((p) => p.join(' ')).join('L') + 'Z'
  }).join('')).join('')
  const name = names[f.properties.shapeName] ?? f.properties.shapeName
  return { name, d }
}).sort((a, b) => a.name.localeCompare(b.name))
let maxX = 0, maxY = 0
for (const f of g.features) { const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates; for (const p of polys) for (const r of p) for (const c of r) { const [x, y] = proj(c); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) } }
const ts = `// South Africa's nine provinces, drawn as SVG paths. Generated from geoBoundaries ZAF ADM1 (simplified), licensed CC BY 4.0
// (https://www.geoboundaries.org, Runfola et al. 2020). Coordinates are an equirectangular projection centred on 29°S:
// x = (longitude - ${LON0}) * cos(29°) * ${K}, y = (${LAT0} - latitude) * ${K}. The paths are simplified to about 0.6 km.
// Regenerate with docs/market-intelligence/README.md. "Nothern Cape" in the source is corrected to "Northern Cape".

export const MAP_PROJECTION = { lon0: ${LON0}, lat0: ${LAT0}, scale: ${K}, cosLat: ${COS} } as const
export const MAP_WIDTH = ${Math.ceil(maxX)}
export const MAP_HEIGHT = ${Math.ceil(maxY)}
export const BOUNDARY_ATTRIBUTION = 'Province boundaries: geoBoundaries (CC BY 4.0)'

export const PROVINCE_SHAPES: ReadonlyArray<{ name: string; d: string }> = ${JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n  {')}
`
fs.writeFileSync(output, ts)
console.log(out.map((p) => [p.name, p.d.length]), Math.ceil(maxX), Math.ceil(maxY), fs.statSync(output).size)
