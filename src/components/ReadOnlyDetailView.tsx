import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileEdit, Play, FileDown, Lock, AlertTriangle, CheckCircle2, Circle, MinusCircle } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import { generatePDFReport } from '../lib/exportReport'
import { getDisplayPriority } from '../lib/displayPriority'
import type { RFEIndex } from '../types'

interface Props {
  rfe: RFEIndex
  onBack: () => void
}

/** Read-only inspection of an RFE — reached by tapping a card in Inventory.
 *  Shows summary + flat list of items with check status, no edit affordances.
 *  Bottom action bar adapts to lifecycle status:
 *   - active / draft : Edit (jumps to ChecklistView)
 *   - finalized      : Resume (confirmation modal first)
 *  All variants offer Back + Export PDF.
 */
export default function ReadOnlyDetailView({ rfe, onBack }: Props) {
  const { setActiveTab, setCurrentRfeId, setInventoryDetailRfeId, userName } = useAppStore()
  const { loadRFE, items, checkStates, activateRFE } = useRealtimeStore()
  const [confirmResume, setConfirmResume] = useState(false)

  useEffect(() => {
    loadRFE(rfe.id)
  }, [rfe.id, loadRFE])

  // Only show items belonging to this RFE — guards against a flicker if loadRFE
  // hasn't replaced the previous RFE's items in the store yet.
  const ownItems = useMemo(
    () => items.filter(i => i.rfe_id === rfe.id),
    [items, rfe.id],
  )

  const total = rfe.count
  const checkedCount = useMemo(() => {
    let c = 0
    for (const it of ownItems) if (checkStates.get(it.id)?.checked) c++
    return c
  }, [ownItems, checkStates])
  const pct = total > 0 ? Math.round((checkedCount / total) * 100) : 0

  const status = rfe.status ?? 'active'
  const isFinalized = status === 'finalized'

  const enterEditMode = () => {
    setCurrentRfeId(rfe.id)
    setInventoryDetailRfeId(null)
    setActiveTab('checklist')
  }

  const handleEdit = () => {
    if (isFinalized) {
      setConfirmResume(true)
      return
    }
    enterEditMode()
  }

  const confirmAndResume = async () => {
    // Re-open: status flips to active, then jump into the checklist editor.
    await activateRFE(rfe.id, userName || 'unknown')
    setConfirmResume(false)
    enterEditMode()
  }

  const handleExportPDF = () => {
    generatePDFReport(rfe, ownItems, checkStates, userName)
  }

  const fieldMappings = useMemo(() => {
    const cfg = rfe.display_config
    if (cfg.aiFieldMap && Object.keys(cfg.aiFieldMap).length > 0) {
      return { ...cfg.aiFieldMap }
    }
    const m: Record<string, string> = {}
    if (cfg.idName && cfg.idName !== cfg.descName) m[cfg.idName] = 'tag_number'
    if (cfg.descName) m[cfg.descName] = 'description'
    return m
  }, [rfe.display_config])

  const importedDate = new Date(rfe.imported_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="readonly-detail">
      {/* Header */}
      <div className="readonly-header">
        <button
          className="readonly-back-btn"
          onClick={onBack}
          aria-label="Back to inventory"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="readonly-header-text">
          <div className="readonly-title-row">
            <h2 className="readonly-title">{rfe.name}</h2>
            {status === 'finalized' && (
              <span
                className="rfe-status-badge finalized"
                role="status"
                aria-label="This list is finalized and read-only"
              >
                <Lock size={10} aria-hidden="true" /> FINALIZED
              </span>
            )}
            {status === 'draft' && (
              <span className="rfe-status-badge draft" role="status" aria-label="Draft">
                <FileEdit size={10} aria-hidden="true" /> DRAFT
              </span>
            )}
          </div>
          {rfe.reference_id && (
            <div className="readonly-subtitle">Ref: {rfe.reference_id}</div>
          )}
          <div className="readonly-subtitle">
            {total} items · imported {importedDate}
          </div>
        </div>
      </div>

      {/* Progress summary */}
      <div className="readonly-progress">
        <div className="readonly-progress-row">
          <span>{checkedCount} / {total} verified</span>
          <span style={{ fontWeight: 700, color: 'var(--green)' }}>{pct}%</span>
        </div>
        <div className="progress-track" style={{ height: 6 }}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Item list — read-only */}
      <div className="readonly-list">
        {ownItems.length === 0 ? (
          <div className="empty-state" style={{ padding: 32 }}>
            <p style={{ color: 'var(--text3)' }}>Loading items…</p>
          </div>
        ) : (
          ownItems.map(item => {
            const s = checkStates.get(item.id)
            const display = getDisplayPriority(item.data, fieldMappings)
            const primary = display.primary || item.id
            const secondary = display.secondary
            const isChecked = !!s?.checked
            const qtyFound = s?.qty_found
            const note = s?.note?.startsWith('CONFLICT:') ? null : s?.note

            let icon: React.ReactNode = <Circle size={16} aria-hidden="true" />
            let cls = 'readonly-item'
            if (isChecked && qtyFound != null && qtyFound > 0) {
              icon = <CheckCircle2 size={16} aria-hidden="true" />
              cls += ' checked'
            } else if (qtyFound != null && qtyFound > 0) {
              icon = <MinusCircle size={16} aria-hidden="true" />
              cls += ' partial'
            }

            return (
              <div key={item.id} className={cls}>
                <div className="readonly-item-icon">{icon}</div>
                <div className="readonly-item-text">
                  <div className="readonly-item-primary">{primary}</div>
                  {secondary && (
                    <div className="readonly-item-secondary">{secondary}</div>
                  )}
                  {note && (
                    <div className="readonly-item-note">Note: {note}</div>
                  )}
                </div>
                {qtyFound != null && (
                  <div
                    className="readonly-item-qty"
                    aria-label={`${qtyFound} found`}
                  >
                    {qtyFound}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Bottom action bar */}
      <div className="readonly-actions" role="toolbar" aria-label="Detail actions">
        <button
          className="readonly-action secondary"
          onClick={onBack}
        >
          <ArrowLeft size={16} /> Back
        </button>
        <button
          className="readonly-action ghost"
          onClick={handleExportPDF}
          disabled={ownItems.length === 0}
          aria-label="Export PDF report"
        >
          <FileDown size={16} /> Export PDF
        </button>
        <button
          className={`readonly-action primary${isFinalized ? ' resume' : ''}`}
          onClick={handleEdit}
        >
          {isFinalized ? <><Play size={16} /> Resume</> : <><FileEdit size={16} /> Edit</>}
        </button>
      </div>

      {/* Confirmation modal — only when re-opening a finalized list */}
      {confirmResume && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resume-title"
          onClick={() => setConfirmResume(false)}
        >
          <div
            className="modal-card"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-icon warning">
              <AlertTriangle size={24} aria-hidden="true" />
            </div>
            <h3 id="resume-title" className="modal-title">Re-open finalized list?</h3>
            <p className="modal-body">
              This list was finalized. Resuming will return it to active status,
              allowing edits again. Other devices viewing it will be notified.
            </p>
            <div className="modal-actions">
              <button
                className="readonly-action secondary"
                onClick={() => setConfirmResume(false)}
              >
                Cancel
              </button>
              <button
                className="readonly-action primary resume"
                onClick={confirmAndResume}
              >
                <Play size={16} /> Resume editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
