import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, Check, WifiOff, Sparkles, AlertTriangle } from 'lucide-react'
import { parseFile, type ParsedFile } from '../lib/fileParser'
import { aiMapColumns, buildSampleRows } from '../lib/aiColumnMapper'
import { mergeAIMapping } from '../lib/columnDetector'
import { applyAIPostProcessing } from '../lib/aiPostProcess'
import { detectReportType } from '../lib/reportType'
import { useRealtimeStore } from '../stores/realtimeStore'
import { useAppStore } from '../stores/appStore'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import ColumnPreview, { type RoleKey, type MappingSource } from './ColumnPreview'
import type { AIMappingResult, DisplayConfig } from '../types'

const OFFLINE_MSG =
  'You are currently offline. Importing new lists requires an internet connection. Please move to an area with signal and try again.'

type Stage = 'idle' | 'analyzing' | 'preview' | 'importing' | 'done'

/** Apply the user's per-column role overrides on top of a base DisplayConfig. */
function applyOverrides(
  base: DisplayConfig,
  headers: string[],
  overrides: Record<string, RoleKey>,
): DisplayConfig {
  const result: DisplayConfig = {
    descName: base.descName,
    idName: base.idName,
    grpName: base.grpName,
    qtyNames: [...base.qtyNames],
    ctxNames: [...base.ctxNames],
  }

  // First, strip any header that has been overridden to a different role
  const cleared = (h: string) => {
    if (result.idName === h) result.idName = ''
    if (result.descName === h) result.descName = ''
    if (result.grpName === h) result.grpName = null
    result.qtyNames = result.qtyNames.filter(x => x !== h)
    result.ctxNames = result.ctxNames.filter(x => x !== h)
  }

  for (const h of headers) {
    const role = overrides[h]
    if (!role) continue
    cleared(h)
    if (role === 'idName')   result.idName = h
    if (role === 'descName') result.descName = h
    if (role === 'grpName')  result.grpName = h
    if (role === 'qtyNames' && !result.qtyNames.includes(h)) result.qtyNames.push(h)
    if (role === 'ctxNames' && !result.ctxNames.includes(h)) result.ctxNames.push(h)
    // 'unmapped' just leaves it cleared
  }

  return result
}

export default function ImportView() {
  const [stage, setStage] = useState<Stage>('idle')
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [aiResult, setAiResult] = useState<AIMappingResult | null>(null)
  const [mappingSource, setMappingSource] = useState<MappingSource>('auto')
  const [overrides, setOverrides] = useState<Record<string, RoleKey>>({})
  const [listName, setListName] = useState('')
  const [listDescription, setListDescription] = useState('')
  const [reportTypeOverride, setReportTypeOverride] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState('')
  const [aiNotices, setAiNotices] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { importRFE, error: storeError } = useRealtimeStore()
  const { setCurrentRfeId, setActiveTab } = useAppStore()
  const { isOnline } = useOnlineStatus()
  const [offlineNotice, setOfflineNotice] = useState('')

  const handleFile = useCallback(async (file: File) => {
    setParseError('')
    setAiResult(null)
    setOverrides({})
    setAiNotices([])
    try {
      // Step 1 — parse locally (works offline)
      const result = await parseFile(file)
      setParsed(result)
      setListName(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '))

      // Step 2 — AI mapping (only if online)
      if (!navigator.onLine) {
        if (import.meta.env.DEV) console.log('[Import] Offline — skipping AI mapping, using fuzzy fallback')
        setMappingSource('auto')
        setStage('preview')
        return
      }

      setStage('analyzing')
      const sampleRows = buildSampleRows(result.headers, result.rows, 5)
      const ai = await aiMapColumns(result.headers, sampleRows, result.fileName, listDescription)

      if (ai) {
        // Dedupe duplicate field claims, apply extraction hints to every row,
        // and split composite columns into searchable parts BEFORE the rows
        // get handed off to the import path — clean data in, clean data stored.
        const post = applyAIPostProcessing(result.rows, ai)
        const cleanedAi: AIMappingResult = { ...ai, mappings: post.cleanedMappings }
        const aiConfig = mergeAIMapping(cleanedAi, result.headers)
        setParsed({ ...result, rows: result.rows, displayConfig: aiConfig })
        setAiResult(cleanedAi)
        setAiNotices(post.notices)
        setMappingSource('ai')
      } else {
        // Backend failed — keep the fuzzy DisplayConfig parseFile already produced
        setMappingSource('auto')
      }
      setStage('preview')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err))
      setStage('idle')
    }
  }, [listDescription])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const handleOverride = useCallback((header: string, role: RoleKey) => {
    setOverrides(o => ({ ...o, [header]: role }))
    // Once user touches anything, mark source as manual for the indicator dot
    setMappingSource(s => s === 'ai' ? 'ai' : 'manual')
  }, [])

  const effectiveConfig: DisplayConfig | null = parsed
    ? applyOverrides(parsed.displayConfig, parsed.headers, overrides)
    : null

  const handleImport = async () => {
    if (!parsed || !effectiveConfig || !listName.trim()) return
    if (!navigator.onLine) {
      if (import.meta.env.DEV) console.log('[Import] Blocked — device is offline')
      setOfflineNotice(OFFLINE_MSG)
      return
    }
    setOfflineNotice('')
    setStage('importing')
    try {
      const trimmedDesc = listDescription.trim()
      const trimmedRefId = referenceId.trim()
      const trimmedOverride = reportTypeOverride.trim()
      const rfeId = await importRFE(
        listName.trim(),
        parsed.fileName,
        parsed.headers,
        parsed.rows,
        effectiveConfig,
        {
          description: trimmedDesc || null,
          report_type: trimmedOverride || detectReportType(trimmedDesc),
          reference_id: trimmedRefId || null,
        },
      )
      setStage('done')
      setTimeout(() => {
        setCurrentRfeId(rfeId)
        setActiveTab('checklist')
        setStage('idle')
        setParsed(null)
        setAiResult(null)
        setOverrides({})
        setListDescription('')
        setReportTypeOverride('')
        setReferenceId('')
      }, 1200)
    } catch (err) {
      if (import.meta.env.DEV) console.log('[Import] Failed:', err)
      setStage('preview')
    }
  }

  const reset = () => {
    setStage('idle')
    setParsed(null)
    setAiResult(null)
    setOverrides({})
    setParseError('')
    setListName('')
    setListDescription('')
    setReportTypeOverride('')
    setReferenceId('')
    setAiNotices([])
  }

  if (stage === 'done') {
    return (
      <div className="view-container">
        <div className="empty-state">
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={32} style={{ color: 'var(--green)' }} />
          </div>
          <h3>Import Complete</h3>
          <p>Opening checklist…</p>
        </div>
      </div>
    )
  }

  const showOfflineBanner = !isOnline || !!offlineNotice

  return (
    <div className="view-container" style={{ overflowY: 'auto' }}>
      <div className="import-container">

        {showOfflineBanner && (
          <div className="offline-banner" role="status">
            <WifiOff size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong style={{ display: 'block', marginBottom: 2 }}>
                Offline — import unavailable
              </strong>
              {offlineNotice || OFFLINE_MSG}
              {parsed && ' Your file selection is kept — tap Import again when you\u2019re back online.'}
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text3)' }}>
                Offline — using automatic column detection only.
              </div>
            </div>
          </div>
        )}

        <div
          className={`dropzone${dragOver ? ' drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={40} className="upload-icon" />
          <h3>{parsed ? parsed.fileName : 'Tap to choose a file'}</h3>
          <p>CSV, XLSX, or XLS · any column layout</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.xlsm"
            style={{ display: 'none' }}
            onChange={onInputChange}
          />
        </div>

        {parseError && (
          <div className="import-error">
            {parseError}
          </div>
        )}

        {/* AI analyzing indicator */}
        {stage === 'analyzing' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              background: 'var(--green-50, var(--green-light))',
              border: '1px solid var(--green-light)',
              borderRadius: 'var(--radius)',
              color: 'var(--green-dark)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <div
              className="spinner"
              style={{
                width: 16, height: 16,
                border: '2px solid var(--green-light)',
                borderTopColor: 'var(--green)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <Sparkles size={14} />
            <span>AI analyzing columns…</span>
          </div>
        )}

        {/* AI notices — duplicate-field warnings and extraction-hint summary */}
        {aiNotices.length > 0 && stage !== 'importing' && stage !== 'analyzing' && (
          <div
            role="status"
            style={{
              display: 'flex',
              gap: 8,
              padding: '10px 12px',
              background: 'var(--orange-light)',
              border: '1px solid var(--orange)',
              borderRadius: 'var(--radius)',
              color: 'var(--orange)',
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {aiNotices.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Preview + import form */}
        {parsed && effectiveConfig && stage !== 'importing' && stage !== 'analyzing' && (
          <>
            <ColumnPreview
              headers={parsed.headers}
              rows={parsed.rows}
              displayConfig={effectiveConfig}
              fileName={parsed.fileName}
              overrides={overrides}
              source={mappingSource}
              aiResult={aiResult}
              onOverride={handleOverride}
            />

            <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '14px 16px' }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
                List Name
              </label>
              <input
                className="name-input"
                type="text"
                value={listName}
                onChange={e => setListName(e.target.value)}
                placeholder="e.g. Hercs Equipment — Site A"
              />
            </div>

            <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '14px 16px' }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
                List Description (optional)
              </label>
              <input
                className="name-input"
                type="text"
                value={listDescription}
                onChange={e => setListDescription(e.target.value)}
                placeholder="e.g., Night shift piping materials, Crane rigging hardware..."
              />
              {listDescription.trim() && !reportTypeOverride.trim() && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
                  Report type: <strong style={{ color: 'var(--green-dark)' }}>{detectReportType(listDescription)}</strong>
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>(auto-detected — override below)</span>
                </div>
              )}
            </div>

            <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '14px 16px' }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
                Report Type Override (optional)
              </label>
              <input
                className="name-input"
                type="text"
                value={reportTypeOverride}
                onChange={e => setReportTypeOverride(e.target.value)}
                placeholder={`Default: ${detectReportType(listDescription.trim())}`}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
                Appears as the PDF report title. Leave blank to use the auto-detected type.
              </div>
            </div>

            <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '14px 16px' }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
                Reference ID (optional)
              </label>
              <input
                className="name-input"
                type="text"
                value={referenceId}
                onChange={e => setReferenceId(e.target.value)}
                placeholder="e.g., RFE-2024-001, Job #12345, RFP #789..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>

            {storeError && <div className="import-error">{storeError}</div>}

            <button
              className="import-btn"
              onClick={handleImport}
              disabled={!listName.trim()}
            >
              <FileText size={18} />
              Import {parsed.rows.length} Items
            </button>

            <button
              onClick={reset}
              style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '8px' }}
            >
              Choose a different file
            </button>
          </>
        )}

        {stage === 'importing' && (
          <div className="empty-state" style={{ padding: '20px 0' }}>
            <div className="spinner" />
            <p>Importing {parsed?.rows.length} items…</p>
          </div>
        )}

        {stage === 'idle' && !parseError && (
          <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>
              Supported formats
            </div>
            {[
              ['CSV', 'Any delimiter, any headers'],
              ['XLSX / XLS', 'First sheet is used'],
              ['AI-Enhanced', 'Smart column mapping with offline fallback'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', width: 80, flexShrink: 0 }}>{k}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
