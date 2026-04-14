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

/** Substring/fuzzy check — does needle appear anywhere in haystack? */
function has(haystack: string, needle: string): boolean {
  return haystack.includes(needle)
}

function scoreHeader(header: string): ColumnScore {
  const n = norm(header)

  let descScore = 0, idScore = 0, qtyScore = 0, ctxScore = 0, grpScore = 0, locScore = 0

  // ── Description scoring ──
  if (n === 'description' || n === 'desc')                descScore += 100
  else if (has(n, 'description'))                         descScore += 85
  if (n === 'cat class description')                      descScore += 95
  if (has(n, 'cat class'))                                descScore += 80
  if (n === 'name' || n === 'item name' || n === 'item description') descScore += 65
  if (has(n, 'material type'))                            descScore += 55
  if (has(n, 'product') && has(n, 'name'))               descScore += 60

  // ── ID / Primary Identifier scoring ──
  // IC Number variants: "IC Number", "IC#", "IC Num", "IC No"
  if (n === 'ic number' || n === 'ic num' || n === 'ic no' || n === 'ic') idScore += 100
  if (has(n, 'ic') && (has(n, 'number') || has(n, 'num') || has(n, 'no') || n.endsWith('ic'))) idScore += 95
  // Asset / Equipment ID
  if (n === 'asset id' || n === 'asset number' || n === 'asset no')  idScore += 100
  if (n === 'item code' || n === 'item no' || n === 'item number')   idScore += 90
  if (n === 'sku' || n === 'barcode')                               idScore += 90
  // Part Number variants: "Part Number", "Part#", "PN", "P/N"
  if (n === 'part number' || n === 'part no' || n === 'part num')   idScore += 85
  if (n === 'pn' || n === 'p n')                                     idScore += 80
  if (has(n, 'part') && (has(n, 'number') || has(n, 'num') || has(n, 'no'))) idScore += 78
  if (n === 'equipment id' || n === 'equip id' || n === 'equipment number') idScore += 90
  if (n === 'id')                                                    idScore += 70
  if (has(n, 'reference') && has(n, 'number'))                       idScore += 45
  if (has(n, 'number') && (has(n, 'item') || has(n, 'asset') || has(n, 'equip'))) idScore += 60

  // ── Quantity scoring ──
  if (n === 'qty' || n === 'quantity' || n === 'qtyordered')         qtyScore += 100
  if (n === 'count' || n === 'amount')                               qtyScore += 80
  if (n === 'inventory quantity')                                    qtyScore += 100
  if (has(n, 'qty') || has(n, 'quantity'))                          qtyScore += 75

  // ── Group scoring ──
  if (n === 'category' || n === 'cat')                               grpScore += 100
  if (n === 'type' || n === 'item type')                             grpScore += 85
  if (n === 'material type')                                         grpScore += 90
  if (n === 'class' || n === 'cat class')                            grpScore += 80
  if (has(n, 'category') || has(n, 'group'))                        grpScore += 70

  // ── Location scoring ──
  if (n === 'location' || n === 'loc' || n === 'site')               locScore += 100
  if (has(n, 'location'))                                            locScore += 75
  if (n === 'warehouse' || n === 'yard')                             locScore += 70

  // ── Context tag scoring ──
  if (n === 'vendor' || n === 'supplier')                            ctxScore += 90
  // Make / Manufacturer
  if (n === 'make' || n === 'manufacturer' || n === 'mfr' || n === 'mfg') ctxScore += 85
  if (has(n, 'make') || has(n, 'manufacturer'))                     ctxScore += 75
  // Model / Model Number
  if (n === 'model' || n === 'model number' || n === 'model no')    ctxScore += 80
  if (has(n, 'model'))                                              ctxScore += 65
  // Serial Number variants: "Serial", "Serial Number", "Serial#", "S/N", "SN"
  if (n === 'serial number' || n === 'serial no' || n === 'serial') ctxScore += 80
  if (n === 'sn' || n === 's n')                                     ctxScore += 70
  if (has(n, 'serial'))                                             ctxScore += 65
  // Year
  if (n === 'year' || n === 'model year' || n === 'yr')             ctxScore += 75
  if (has(n, 'year'))                                               ctxScore += 60
  // Status
  if (n === 'status' || n === 'condition')                          ctxScore += 70
  if (has(n, 'status'))                                             ctxScore += 55
  // VIN / PO
  if (n === 'vin' || n === 'vin number')                            ctxScore += 65
  if (has(n, 'po number') || n === 'po')                            ctxScore += 65
  if (has(n, 'gps'))                                                ctxScore += 45
  if (has(n, 'ship') || has(n, 'bundle'))                           ctxScore += 40
  if (n === 'dimensions' || n === 'weight')                         ctxScore += 40

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

  // Context columns (up to 6, not already assigned)
  const used = new Set([descName, idName, grpName, ...qtyNames].filter(Boolean) as string[])
  const ctxNames = scores
    .filter(s => !used.has(s.header) && (s.ctxScore > 30 || s.locScore > 50))
    .sort((a, b) => (b.ctxScore + b.locScore) - (a.ctxScore + a.locScore))
    .slice(0, 6)
    .map(s => s.header)

  const config: DisplayConfig = { descName, idName, ctxNames, qtyNames, grpName }

  // Log detected mappings for debugging
  console.group('[FieldCheck] Column detection results')
  console.log('ID column     →', idName)
  console.log('Desc column   →', descName)
  console.log('Qty columns   →', qtyNames.length ? qtyNames : '(none)')
  console.log('Group column  →', grpName ?? '(none)')
  console.log('Context tags  →', ctxNames.length ? ctxNames : '(none)')
  const allUsed = new Set([idName, descName, grpName, ...qtyNames, ...ctxNames].filter(Boolean) as string[])
  const unmapped = headers.filter(h => !allUsed.has(h))
  if (unmapped.length) console.log('Unmapped cols →', unmapped, '(shown in Details)')
  console.groupEnd()

  return config
}
