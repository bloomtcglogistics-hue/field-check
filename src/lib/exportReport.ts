import type { RFEIndex, Item, CheckState } from '../types'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function generateHTMLReport(
  rfe: RFEIndex,
  items: Item[],
  checkStates: Map<string, CheckState>
): string {
  const { descName, idName } = rfe.display_config
  const total = items.length
  const checkedCount = items.filter(it => checkStates.get(it.id)?.checked).length
  const missing = total - checkedCount
  const pct = total > 0 ? Math.round((checkedCount / total) * 100) : 0

  const date = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  const rows = items.map(item => {
    const state = checkStates.get(item.id)
    const isChecked = state?.checked ?? false
    const desc = item.data[descName] || '—'
    const id = item.data[idName] || '—'
    const note = state?.note || ''
    const by = state?.checked_by || ''
    const ts = state?.checked_at ? new Date(state.checked_at).toLocaleString() : ''
    const rowBg = isChecked ? '#f0fdf4' : '#fff7f0'
    const dotColor = isChecked ? '#16a34a' : '#f97316'
    const dotChar = isChecked ? '✓' : '○'

    return `<tr style="background:${rowBg}">
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:${dotColor};font-size:16px;text-align:center">${dotChar}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:12px">${esc(id)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px">${esc(desc)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px">${esc(note)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px">${esc(by)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#94a3b8;font-size:11px;white-space:nowrap">${esc(ts)}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TCG Field Check Report — ${esc(rfe.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body{font-family:'DM Sans',Arial,sans-serif;margin:0;padding:24px;color:#1e293b;background:#f8fafc}
  .header{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;padding:24px 28px;border-radius:12px;margin-bottom:24px}
  .header h1{margin:0 0 4px;font-size:22px}
  .header p{margin:3px 0;opacity:.85;font-size:14px}
  .stats{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap}
  .stat{flex:1;min-width:100px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center}
  .stat .n{font-size:28px;font-weight:700}
  .stat .l{font-size:12px;color:#64748b;margin-top:2px}
  .g{color:#16a34a}.o{color:#f97316}.s{color:#64748b}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  th{text-align:left;padding:10px 10px;background:#f8fafc;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
  .sig{margin-top:48px;display:flex;gap:40px;flex-wrap:wrap}
  .sig-line{flex:1;min-width:160px;border-top:1px solid #1e293b;padding-top:6px;font-size:12px;color:#64748b}
  @media print{body{padding:0;background:#fff}.stat{break-inside:avoid}}
</style>
</head>
<body>
<div class="header">
  <h1>TCG Field Check Report</h1>
  <p><strong>${esc(rfe.name)}</strong></p>
  <p>File: ${esc(rfe.file_name)} &nbsp;·&nbsp; Generated: ${date}</p>
</div>
<div class="stats">
  <div class="stat"><div class="n s">${total}</div><div class="l">Total Items</div></div>
  <div class="stat"><div class="n g">${checkedCount}</div><div class="l">Found (${pct}%)</div></div>
  <div class="stat"><div class="n o">${missing}</div><div class="l">Missing</div></div>
</div>
<table>
  <thead>
    <tr>
      <th style="width:40px">✓</th>
      <th>${esc(idName)}</th>
      <th>${esc(descName)}</th>
      <th>Note</th>
      <th>Verified By</th>
      <th>Time</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="sig">
  <div class="sig-line">Supervisor Signature</div>
  <div class="sig-line">Date</div>
  <div class="sig-line">Field Supervisor Name (Print)</div>
</div>
</body>
</html>`
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
