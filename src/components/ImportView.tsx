import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, Check, WifiOff } from 'lucide-react'
import { parseFile, type ParsedFile } from '../lib/fileParser'
import { useRealtimeStore } from '../stores/realtimeStore'
import { useAppStore } from '../stores/appStore'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import ColumnPreview from './ColumnPreview'

const OFFLINE_MSG =
  'You are currently offline. Importing new lists requires an internet connection. Please move to an area with signal and try again.'

type Stage = 'idle' | 'preview' | 'importing' | 'done'

export default function ImportView() {
  const [stage, setStage] = useState<Stage>('idle')
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [listName, setListName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { importRFE, importing, error: storeError } = useRealtimeStore()
  const { setCurrentRfeId, setActiveTab } = useAppStore()
  const { isOnline } = useOnlineStatus()
  const [offlineNotice, setOfflineNotice] = useState('')

  const handleFile = useCallback(async (file: File) => {
    setParseError('')
    try {
      const result = await parseFile(file)
      setParsed(result)
      // Auto-generate list name from file name (strip extension)
      setListName(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '))
      setStage('preview')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = '' // reset so same file can be re-selected
  }

  const handleImport = async () => {
    if (!parsed || !listName.trim()) return
    // Double-check connectivity right before the network call. Parsing and
    // preview work offline, but the actual multi-table insert requires Supabase.
    if (!navigator.onLine) {
      console.log('[Import] Blocked — device is offline')
      setOfflineNotice(OFFLINE_MSG)
      return
    }
    setOfflineNotice('')
    setStage('importing')
    try {
      const rfeId = await importRFE(
        listName.trim(),
        parsed.fileName,
        parsed.headers,
        parsed.rows,
        parsed.displayConfig
      )
      setStage('done')
      // After a short delay, navigate to the new checklist
      setTimeout(() => {
        setCurrentRfeId(rfeId)
        setActiveTab('checklist')
        setStage('idle')
        setParsed(null)
      }, 1200)
    } catch (err) {
      console.log('[Import] Failed:', err)
      setStage('preview') // error shown via storeError
    }
  }

  const reset = () => {
    setStage('idle')
    setParsed(null)
    setParseError('')
    setListName('')
  }

  // ── Done state ──
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

        {/* Offline notice — parsing/preview still works, the Supabase write does not */}
        {showOfflineBanner && (
          <div
            role="status"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              background: '#fff7ed',
              border: '1px solid #fdba74',
              color: '#9a3412',
              padding: '12px 14px',
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            <WifiOff size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong style={{ display: 'block', marginBottom: 2 }}>
                Offline — import unavailable
              </strong>
              {offlineNotice || OFFLINE_MSG}
              {parsed && ' Your file selection is kept — tap Import again when you\u2019re back online.'}
            </div>
          </div>
        )}

        {/* Drop zone */}
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

        {/* Parse error */}
        {parseError && (
          <div className="import-error">
            {parseError}
          </div>
        )}

        {/* Column preview + import form */}
        {parsed && stage !== 'importing' && (
          <>
            <ColumnPreview
              headers={parsed.headers}
              rows={parsed.rows}
              displayConfig={parsed.displayConfig}
              fileName={parsed.fileName}
            />

            {/* List name */}
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

            {/* Store error */}
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

        {/* Importing spinner */}
        {stage === 'importing' && (
          <div className="empty-state" style={{ padding: '20px 0' }}>
            <div className="spinner" />
            <p>Importing {parsed?.rows.length} items…</p>
          </div>
        )}

        {/* Help text when idle */}
        {stage === 'idle' && !parseError && (
          <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>
              Supported formats
            </div>
            {[
              ['CSV', 'Any delimiter, any headers'],
              ['XLSX / XLS', 'First sheet is used'],
              ['Auto-detect', 'ID, description, qty, category, tags'],
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
