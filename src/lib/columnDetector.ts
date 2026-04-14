import type { DisplayConfig } from '../types'

interface ColumnScore {
  header: string
  descScore: number
  idScore: number
  qtyScore: number
  ctxScore: number
  grpScore: number
  locScore: number
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function scoreHeader(header: string): ColumnScore {
  const n = norm(header)

  let descScore = 0, idScore = 0, qtyScore = 0, ctxScore = 0, grpScore = 0, locScore = 0

  // ── Description scoring ──
  if (n === 'description' || n === 'desc')       descScore += 100
  else if (n.includes('description'))            descScore += 85
  if (n === 'cat class description')             descScore += 95
  if (n.includes('cat class'))                   descScore += 80
  if (n === 'name' || n === 'item name')         descScore += 65
  if (n.includes('material type'))               descScore += 55
  if (n.includes('product') && n.includes('name')) descScore += 60

  // ── ID scoring ──
  if (n === 'ic number')                         idScore += 100
  if (n === 'asset id' || n === 'asset number')  idScore += 100
  if (n === 'item code' || n === 'item no')      idScore += 90
  if (n === 'sku' || n === 'barcode')            idScore += 90
  if (n === 'part number' || n === 'part no')    idScore += 85
  if (n === 'equipment id' || n === 'equip id')  idScore += 90
  if (n === 'id')                                idScore += 70
  if (n.includes('reference') && n.includes('number')) idScore += 45
  if (n.includes('number') && (n.includes('item') || n.includes('asset') || n.includes('equip'))) idScore += 60

  // ── Quantity scoring ──
  if (n === 'qty' || n === 'quantity')           qtyScore += 100
  if (n === 'count' || n === 'amount')           qtyScore += 80
  if (n === 'inventory quantity')                qtyScore += 100
  if (n.includes('qty') || n.includes('quantity')) qtyScore += 75

  // ── Group scoring ──
  if (n === 'category' || n === 'cat')           grpScore += 100
  if (n === 'type' || n === 'item type')         grpScore += 85
  if (n === 'material type')                     grpScore += 90
  if (n === 'class' || n === 'cat class')        grpScore += 80
  if (n.includes('category') || n.includes('group')) grpScore += 70

  // ── Location scoring ──
  if (n === 'location' || n === 'loc' || n === 'site') locScore += 100
  if (n.includes('location'))                    locScore += 75
  if (n === 'warehouse' || n === 'yard')         locScore += 70

  // ── Context tag scoring ──
  if (n === 'vendor' || n === 'supplier')        ctxScore += 90
  if (n === 'make' || n === 'manufacturer')      ctxScore += 85
  if (n === 'model' || n === 'model number')     ctxScore += 75
  if (n === 'serial number' || n === 'serial no' || n === 'serial') ctxScore += 75
  if (n === 'vin' || n === 'vin number')         ctxScore += 65
  if (n.includes('po number') || n === 'po')     ctxScore += 65
  if (n.includes('gps'))                         ctxScore += 45
  if (n.includes('ship') || n.includes('bundle')) ctxScore += 40
  if (n === 'dimensions' || n === 'weight')      ctxScore += 40

  return { header, descScore, idScore, qtyScore, ctxScore, grpScore, locScore }
}

export function detectColumns(headers: string[]): DisplayConfig {
  if (headers.length === 0) {
    return { descName: '', idName: '', ctxNames: [], qtyNames: [], grpName: null }
  }

  const scores = headers.map(scoreHeader)

  // Best description column
  const byDesc = [...scores].sort((a, b) => b.descScore - a.descScore)
  const descName = byDesc[0].descScore > 20 ? byDesc[0].header : headers[Math.min(1, headers.length - 1)]

  // Best ID column (not same as desc)
  const byId = scores.filter(s => s.header !== descName).sort((a, b) => b.idScore - a.idScore)
  const idName = byId[0] && byId[0].idScore > 20 ? byId[0].header : headers[0]

  // Best group column
  const byGrp = scores
    .filter(s => s.header !== descName && s.header !== idName)
    .sort((a, b) => b.grpScore - a.grpScore)
  const grpName = byGrp[0] && byGrp[0].grpScore > 40 ? byGrp[0].header : null

  // Quantity columns
  const qtyNames = scores
    .filter(s => s.qtyScore > 50 && s.header !== descName && s.header !== idName)
    .map(s => s.header)

  // Context columns (up to 4, not already assigned)
  const used = new Set([descName, idName, grpName, ...qtyNames].filter(Boolean) as string[])
  const ctxNames = scores
    .filter(s => !used.has(s.header) && (s.ctxScore > 30 || s.locScore > 50))
    .sort((a, b) => (b.ctxScore + b.locScore) - (a.ctxScore + a.locScore))
    .slice(0, 4)
    .map(s => s.header)

  return { descName, idName, ctxNames, qtyNames, grpName }
}
