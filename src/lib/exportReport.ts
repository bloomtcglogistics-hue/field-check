import { jsPDF } from 'jspdf'
import autoTable, { type CellHookData } from 'jspdf-autotable'
import type { RFEIndex, Item, CheckState } from '../types'

// ── Brand palette ────────────────────────────────────────────────────────
type RGB = [number, number, number]
const NAVY: RGB = [27, 58, 92]
const GREEN: RGB = [22, 163, 74]
const ORANGE: RGB = [249, 115, 22]
const GRAY: RGB = [107, 114, 128]
const LIGHT_GRAY: RGB = [249, 250, 251]
const BORDER_GRAY: RGB = [229, 231, 235]
const PROGRESS_TRACK: RGB = [229, 231, 235]
const FOUND_BG: RGB = [240, 253, 244]
const MISSING_BG: RGB = [255, 247, 237]
const AMBER: RGB = [245, 158, 11]
const AMBER_DARK: RGB = [180, 83, 9]
const AMBER_BG: RGB = [253, 230, 138]
const BLACK: RGB = [17, 24, 39]
const WHITE: RGB = [255, 255, 255]

const setText = (d: jsPDF, c: RGB) => d.setTextColor(c[0], c[1], c[2])
const setFill = (d: jsPDF, c: RGB) => d.setFillColor(c[0], c[1], c[2])
const setStroke = (d: jsPDF, c: RGB) => d.setDrawColor(c[0], c[1], c[2])

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function buildFilenameStamp(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
}

function extractFileFormat(fileName: string | null | undefined): string {
  const name = (fileName ?? '').trim()
  if (!name) return '\u2014'
  const dot = name.lastIndexOf('.')
  if (dot === -1 || dot === name.length - 1) return 'FILE'
  return name.slice(dot + 1).toUpperCase()
}

function buildFilenamePrefix(reportType: string | null | undefined): string {
  const firstWord = (reportType ?? '').trim().split(/\s+/)[0] ?? ''
  if (!firstWord) return 'TCG_Field_Report_'
  const titled = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase()
  return `TCG_${titled}_Report_`
}

/**
 * Generate a professional TCG Equipment Verification Report PDF and trigger download.
 * Designed for client/supervisor presentation on industrial sites.
 */
export function generatePDFReport(
  rfe: RFEIndex,
  items: Item[],
  checkStates: Map<string, CheckState>,
  userName = ''
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const M = 43.2 // 0.6" margin

  const { descName, idName, ctxNames, qtyNames } = rfe.display_config
  const qtyColName = qtyNames[0] ?? null
  const getRequiredQty = (item: Item): number => {
    if (!qtyColName) return 0
    const n = parseInt(item.data[qtyColName] ?? '0', 10)
    return isNaN(n) ? 0 : n
  }
  const partialSet = new Set<string>()
  for (const it of items) {
    const s = checkStates.get(it.id)
    const req = getRequiredQty(it)
    const found = s?.qty_found ?? 0
    if (found > 0 && req > 0 && found < req) partialSet.add(it.id)
  }
  const total = items.length
  const checkedCount = items.filter(it => checkStates.get(it.id)?.checked).length
  const partialCount = partialSet.size
  const missing = total - checkedCount - partialCount
  const pct = total > 0 ? Math.round((checkedCount / total) * 100) : 0

  const now = new Date()
  const dateLong = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const timeShort = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const dateShort = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  let y = M

  // ── Section 1: Brand header ──────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  setText(doc, NAVY)
  doc.setFontSize(26)
  doc.text('THOMPSON', M, y + 18, { charSpace: 2 })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('C O N S T R U C T I O N   G R O U P', M, y + 32, { charSpace: 1 })

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  setText(doc, GRAY)
  doc.text('Est. 1986 \u2022 Sumter, SC', M, y + 44)

  // TCG mark top-right
  doc.setFont('helvetica', 'bold')
  setText(doc, NAVY)
  doc.setFontSize(28)
  doc.text('TCG', pageW - M, y + 24, { align: 'right' })

  y += 58

  // Thin navy rule
  setStroke(doc, NAVY)
  doc.setLineWidth(1)
  doc.line(M, y, pageW - M, y)
  y += 22

  // Title — smart from report_type, fallback to FIELD VERIFICATION REPORT
  const reportTitle = (rfe.report_type && rfe.report_type.trim())
    ? rfe.report_type.toUpperCase()
    : 'FIELD VERIFICATION REPORT'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  setText(doc, NAVY)
  doc.text(reportTitle, pageW / 2, y, { align: 'center' })
  y += 18

  // Description subtitle (user-entered at import time)
  if (rfe.description && rfe.description.trim()) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(11)
    setText(doc, GRAY)
    doc.text(rfe.description.trim(), pageW / 2, y, { align: 'center' })
    y += 16
  }

  // Date / time
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  setText(doc, GRAY)
  doc.text(`${dateLong} \u2014 ${timeShort}`, pageW / 2, y, { align: 'center' })
  y += 26

  // ── Section 2: Report meta ───────────────────────────────────────────
  const drawMeta = (label: string, value: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    setText(doc, GRAY)
    doc.text(label, x, yy)
    const lw = doc.getTextWidth(label)
    doc.setFont('helvetica', 'bold')
    setText(doc, BLACK)
    doc.text(value || '\u2014', x + lw + 4, yy)
  }

  const colL = M
  const colR = pageW / 2 + 10

  drawMeta('Source:', extractFileFormat(rfe.file_name), colL, y)
  drawMeta('Company:', 'TCG \u2014 Thompson Construction Group', colR, y)
  y += 15
  drawMeta('Inspector:', userName, colL, y)
  drawMeta('List:', rfe.name, colR, y)
  y += 12

  // Separator
  setStroke(doc, BORDER_GRAY)
  doc.setLineWidth(0.5)
  doc.line(M, y, pageW - M, y)
  y += 18

  // ── Section 3: Summary statistics (5 boxes) ──────────────────────────
  const boxGap = 8
  const boxCount = 5
  const boxW = (pageW - 2 * M - (boxCount - 1) * boxGap) / boxCount
  const boxH = 56

  const stats: Array<{ label: string; value: string; color: RGB }> = [
    { label: 'TOTAL', value: String(total), color: GRAY },
    { label: 'FOUND', value: String(checkedCount), color: GREEN },
    { label: 'PARTIAL', value: String(partialCount), color: AMBER },
    { label: 'MISSING', value: String(Math.max(0, missing)), color: ORANGE },
    { label: 'COMPLETE', value: `${pct}%`, color: GREEN },
  ]

  stats.forEach((s, i) => {
    const x = M + i * (boxW + boxGap)
    setStroke(doc, BORDER_GRAY)
    doc.setLineWidth(0.7)
    doc.roundedRect(x, y, boxW, boxH, 4, 4, 'S')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    setText(doc, s.color)
    doc.text(s.value, x + boxW / 2, y + 28, { align: 'center' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setText(doc, GRAY)
    doc.text(s.label, x + boxW / 2, y + 46, { align: 'center', charSpace: 1 })
  })
  y += boxH + 14

  // Progress bar
  const barW = pageW - 2 * M
  const barH = 6
  setFill(doc, PROGRESS_TRACK)
  doc.roundedRect(M, y, barW, barH, 3, 3, 'F')
  if (pct > 0) {
    const filled = Math.max(barH, (barW * pct) / 100)
    setFill(doc, GREEN)
    doc.roundedRect(M, y, filled, barH, 3, 3, 'F')
  }
  y += barH + 16

  // ── Section 4: Item table ────────────────────────────────────────────
  const extraCols = ctxNames.slice(0, 3)
  const head: string[] = ['#', idName || 'ID', descName || 'Description', ...extraCols, 'Qty Requested', 'Qty Found', 'Status', 'Notes']
  const reqColIdx = 3 + extraCols.length
  const foundColIdx = reqColIdx + 1
  const statusColIdx = foundColIdx + 1
  const notesColIdx = head.length - 1

  const body = items.map((item, idx) => {
    const state = checkStates.get(item.id)
    const isChecked = state?.checked ?? false
    const isPartial = partialSet.has(item.id)
    const id = item.data[idName] || ''
    const desc = item.data[descName] || ''
    const note = state?.note || ''
    const by = state?.checked_by || ''
    const ts = state?.checked_at
      ? new Date(state.checked_at).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      : ''
    const auditLine = by ? `\u2014 ${by}${ts ? ` @ ${ts}` : ''}` : ''
    const noteText = [note, auditLine].filter(Boolean).join('\n')

    const req = getRequiredQty(item)
    const reqText = req > 0 ? String(req) : '\u2014'
    const qtyFound = state?.qty_found
    let foundNum: number
    if (isPartial) {
      foundNum = qtyFound ?? 0
    } else if (isChecked) {
      foundNum = qtyFound && qtyFound > 0 ? qtyFound : req
    } else {
      foundNum = 0
    }
    const foundText = foundNum > 0 ? String(foundNum) : '\u2014'

    let statusText: string
    if (isPartial) {
      statusText = `PARTIAL (${foundNum}/${req})`
    } else if (isChecked) {
      statusText = 'FOUND'
    } else {
      statusText = 'MISSING'
    }

    return [
      String(idx + 1),
      id,
      desc,
      ...extraCols.map(c => item.data[c] || ''),
      reqText,
      foundText,
      statusText,
      noteText,
    ]
  })

  autoTable(doc, {
    head: [head],
    body,
    startY: y,
    margin: { left: M, right: M, top: M, bottom: M + 24 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 5,
      textColor: BLACK,
      lineColor: BORDER_GRAY,
      lineWidth: 0.3,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'left',
      cellPadding: 6,
      lineColor: NAVY,
      lineWidth: 0,
      overflow: 'visible',
    },
    columnStyles: {
      0: { cellWidth: 24, halign: 'center', textColor: GRAY },
      1: { fontStyle: 'bold', cellWidth: 64 },
      [reqColIdx]: { halign: 'center', cellWidth: 58 },
      [foundColIdx]: { halign: 'center', cellWidth: 52 },
      [statusColIdx]: { fontStyle: 'bold', halign: 'center', cellWidth: 70 },
      [notesColIdx]: { textColor: GRAY, fontStyle: 'italic' },
    },
    didParseCell(data: CellHookData) {
      if (data.section !== 'body') return
      const rowIdx = data.row.index
      const item = items[rowIdx]
      if (!item) return
      const isChecked = checkStates.get(item.id)?.checked ?? false
      const isPartial = partialSet.has(item.id)

      if (isPartial) {
        data.cell.styles.fillColor = isAlt(rowIdx) ? LIGHT_GRAY : AMBER_BG
      } else if (isChecked) {
        data.cell.styles.fillColor = isAlt(rowIdx) ? LIGHT_GRAY : FOUND_BG
      } else {
        data.cell.styles.fillColor = isAlt(rowIdx) ? LIGHT_GRAY : MISSING_BG
      }

      if (data.column.index === statusColIdx) {
        data.cell.styles.textColor = isPartial ? AMBER_DARK : (isChecked ? GREEN : ORANGE)
        data.cell.styles.fontStyle = 'bold'
      }
      if (data.column.index === notesColIdx) {
        data.cell.styles.textColor = GRAY
        data.cell.styles.fontStyle = 'italic'
      }
    },
  })

  // ── Section 6: Signature block (after table) ─────────────────────────
  const anyDoc = doc as unknown as { lastAutoTable?: { finalY: number } }
  const finalY = anyDoc.lastAutoTable?.finalY ?? y
  const sigNeeded = 80
  let sigY: number
  if (finalY + sigNeeded > pageH - M - 24) {
    doc.addPage()
    sigY = M + 40
  } else {
    sigY = finalY + 48
  }

  const sigGap = 24
  const sigColW = (pageW - 2 * M - 2 * sigGap) / 3
  const sigCols = [
    { x: M, label: 'Inspector Signature' },
    { x: M + sigColW + sigGap, label: 'Date' },
    { x: M + 2 * (sigColW + sigGap), label: 'Supervisor Name (Print)' },
  ]
  sigCols.forEach(c => {
    setStroke(doc, BLACK)
    doc.setLineWidth(0.6)
    doc.line(c.x, sigY, c.x + sigColW, sigY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setText(doc, GRAY)
    doc.text(c.label, c.x, sigY + 14)
  })

  // ── Section 5: Footer on every page (second pass) ────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const pW = doc.internal.pageSize.getWidth()
    const pH = doc.internal.pageSize.getHeight()

    setStroke(doc, NAVY)
    doc.setLineWidth(0.5)
    doc.line(M, pH - 30, pW - M, pH - 30)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setText(doc, GRAY)
    doc.text('Thompson Construction Group \u2022 Equipment Verification Report', M, pH - 18)
    doc.text(dateShort, pW / 2, pH - 18, { align: 'center' })
    doc.text(`Page ${p} of ${totalPages}`, pW - M, pH - 18, { align: 'right' })
  }

  // ── Save ─────────────────────────────────────────────────────────────
  const filename = `${buildFilenamePrefix(rfe.report_type)}${buildFilenameStamp(now)}.pdf`
  doc.save(filename)
}

function isAlt(rowIdx: number): boolean {
  // Kept for future use if alternating shading over status tint is desired.
  // Currently returns false so status tints render consistently per row.
  void rowIdx
  return false
}

// ────────────────────────────────────────────────────────────────────────
// Legacy HTML export — kept as fallback in case PDF generation fails.
// ────────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const TH = 'text-align:left;padding:9px 10px;background:#f9fafb;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px'

export function generateHTMLReportLegacy(
  rfe: RFEIndex,
  items: Item[],
  checkStates: Map<string, CheckState>,
  checkedBy = ''
): string {
  const { descName, idName, ctxNames } = rfe.display_config
  const total = items.length
  const checkedCount = items.filter(it => checkStates.get(it.id)?.checked).length
  const missing = total - checkedCount
  const pct = total > 0 ? Math.round((checkedCount / total) * 100) : 0

  const date = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  const extraCols = ctxNames.slice(0, 4)
  const extraHeaders = extraCols.map(c => `<th style="${TH}">${esc(c)}</th>`).join('')

  const rows = items.map(item => {
    const state = checkStates.get(item.id)
    const isChecked = state?.checked ?? false
    const desc = item.data[descName] || ''
    const id = item.data[idName] || ''
    const note = state?.note || ''
    const by = state?.checked_by || ''
    const ts = state?.checked_at
      ? new Date(state.checked_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : ''
    const rowBg = isChecked ? '#f0fdf4' : '#fff7f0'
    const statusColor = isChecked ? '#16a34a' : '#f97316'
    const statusChar = isChecked ? '&#10003;' : '&#9675;'
    const extraCells = extraCols
      .map(c => `<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280">${esc(item.data[c] || '')}</td>`)
      .join('')

    return [
      `<tr style="background:${rowBg}">`,
      `<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;color:${statusColor};font-size:18px;text-align:center;font-weight:700">${statusChar}</td>`,
      `<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-weight:700;font-size:12px;white-space:nowrap">${esc(id)}</td>`,
      `<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:13px">${esc(desc)}</td>`,
      extraCells,
      `<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px">${esc(note)}</td>`,
      `<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;white-space:nowrap">${esc(by)}</td>`,
      `<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:11px;white-space:nowrap">${esc(ts)}</td>`,
      `</tr>`,
    ].join('')
  }).join('')

  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>TCG Field Check \u2014 ${esc(rfe.name)}</title>`,
    '<style>',
    '*{box-sizing:border-box;margin:0;padding:0}',
    "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;padding:24px;color:#111827;background:#f3f4f6}",
    '.header{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;padding:24px 28px;border-radius:12px;margin-bottom:20px}',
    '.header h1{font-size:22px;font-weight:700;margin-bottom:4px}',
    '.header p{font-size:13px;opacity:.85;margin-top:3px}',
    '.meta{font-size:12px;opacity:.75;margin-top:8px}',
    '.stats{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}',
    '.stat{flex:1;min-width:90px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;text-align:center}',
    '.stat .n{font-size:26px;font-weight:700}',
    '.stat .l{font-size:12px;color:#6b7280;margin-top:2px}',
    '.g{color:#16a34a}.o{color:#f97316}.s{color:#6b7280}',
    '.progress-bar{height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;margin-bottom:20px}',
    '.progress-fill{height:100%;background:#16a34a;border-radius:4px}',
    'table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:32px}',
    '.sig{display:flex;gap:40px;flex-wrap:wrap}',
    '.sig-line{flex:1;min-width:140px;border-top:1px solid #111827;padding-top:6px;font-size:12px;color:#6b7280}',
    '@media print{body{padding:0;background:#fff}.stat{break-inside:avoid}table{box-shadow:none}.progress-bar{-webkit-print-color-adjust:exact;print-color-adjust:exact}}',
    '</style>',
    '</head>',
    '<body>',
    '<div class="header">',
    '  <h1>TCG Field Check Report</h1>',
    `  <p><strong>${esc(rfe.name)}</strong></p>`,
    `  <p>File: ${esc(rfe.file_name)}</p>`,
    `  <div class="meta">Generated: ${date}${checkedBy ? ` &middot; By: ${esc(checkedBy)}` : ''}</div>`,
    '</div>',
    '<div class="stats">',
    `  <div class="stat"><div class="n s">${total}</div><div class="l">Total Items</div></div>`,
    `  <div class="stat"><div class="n g">${checkedCount}</div><div class="l">Found</div></div>`,
    `  <div class="stat"><div class="n o">${missing}</div><div class="l">Missing</div></div>`,
    `  <div class="stat"><div class="n g">${pct}%</div><div class="l">Complete</div></div>`,
    '</div>',
    `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>`,
    '<table>',
    '  <thead><tr>',
    `    <th style="${TH};width:36px">&#10003;</th>`,
    `    <th style="${TH}">${esc(idName)}</th>`,
    `    <th style="${TH}">${esc(descName)}</th>`,
    `    ${extraHeaders}`,
    `    <th style="${TH}">Note</th>`,
    `    <th style="${TH}">Verified By</th>`,
    `    <th style="${TH}">Time</th>`,
    '  </tr></thead>',
    `  <tbody>${rows}</tbody>`,
    '</table>',
    '<div class="sig">',
    '  <div class="sig-line">Supervisor Signature</div>',
    '  <div class="sig-line">Date</div>',
    '  <div class="sig-line">Field Supervisor Name (Print)</div>',
    '</div>',
    '</body>',
    '</html>',
  ].join('\n')

  return html
}

export function downloadReport(html: string, rfe: RFEIndex): void {
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `TCG-FieldCheck-${rfe.name.replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().slice(0, 10)}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
