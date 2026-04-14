import type { RFEIndex, Item, CheckState } from '../types'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const TH = 'text-align:left;padding:9px 10px;background:#f9fafb;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px'

export function generateHTMLReport(
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
    '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">',
    '<style>',
    '*{box-sizing:border-box;margin:0;padding:0}',
    "body{font-family:'DM Sans',Arial,sans-serif;padding:24px;color:#111827;background:#f3f4f6}",
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
