import * as XLSX from 'xlsx'
import type { DisplayConfig } from '../types'
import { detectColumns } from './columnDetector'

export interface ParsedFile {
  headers: string[]
  rows: Record<string, string>[]
  displayConfig: DisplayConfig
  fileName: string
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  let workbook: XLSX.WorkBook

  if (ext === 'csv') {
    const text = await file.text()
    workbook = XLSX.read(text, { type: 'string' })
  } else if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') {
    const buffer = await file.arrayBuffer()
    workbook = XLSX.read(buffer, { type: 'array' })
  } else {
    throw new Error(`Unsupported file type: .${ext}. Please use CSV, XLSX, or XLS.`)
  }

  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  if (raw.length === 0) {
    throw new Error('File is empty or has no data rows. Make sure the first row contains headers.')
  }

  const headers = Object.keys(raw[0])

  if (headers.length === 0) {
    throw new Error('Could not read column headers from file.')
  }

  // Normalize all values to strings
  const rows = raw.map(row =>
    Object.fromEntries(headers.map(h => [h, String(row[h] ?? '').trim()]))
  )

  const displayConfig = detectColumns(headers)

  return { headers, rows, displayConfig, fileName: file.name }
}
