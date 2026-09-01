'use client'

import React, { useMemo, useState } from 'react'

/**
 * Sorting and column resizing for any table in the app.
 *
 * Pages keep rendering their own rows — this owns the header, the widths and
 * the ordering, so every table behaves the same way without any of them having
 * to reimplement it. Widths persist per table, per browser.
 */

export type SortValue = string | number | Date | null | undefined

export interface ColumnDef<T> {
  key: string
  label: string
  width: number
  align?: 'left' | 'right' | 'center'
  /** Omit to make the column unsortable (actions, checkboxes, thumbnails). */
  sortValue?: (row: T) => SortValue
  /** Numeric and date columns are more useful biggest-first on the first click. */
  descFirst?: boolean
}

interface Sort {
  key: string
  dir: 1 | -1
}

// Blanks sink to the bottom whichever way the column points — an empty owner is
// never the row you were looking for.
function compare(a: SortValue, b: SortValue, dir: 1 | -1): number {
  const empty = (v: SortValue) => v === undefined || v === null || v === ''
  if (empty(a) && empty(b)) return 0
  if (empty(a)) return 1
  if (empty(b)) return -1
  if (a instanceof Date && b instanceof Date) return (a.getTime() - b.getTime()) * dir
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir
  return String(a).localeCompare(String(b), 'en-GB', { numeric: true }) * dir
}

const th: React.CSSProperties = {
  padding: '9px 12px',
  fontSize: '10px',
  fontWeight: 600,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
  position: 'relative',
  background: '#fafafa',
  borderBottom: '1px solid #f3f4f6',
}

export function useTable<T>(storageKey: string, columns: ColumnDef<T>[]) {
  const key = `foodlab-cols-${storageKey}`

  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const base = Object.fromEntries(columns.map((c) => [c.key, c.width]))
    try {
      return { ...base, ...JSON.parse(localStorage.getItem(key) || '{}') }
    } catch {
      return base
    }
  })
  const [sort, setSort] = useState<Sort | null>(null)

  function persist(next: Record<string, number>) {
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* private mode */ }
  }

  function startResize(colKey: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = widths[colKey] ?? 120
    const move = (ev: MouseEvent) =>
      setWidths((w) => ({ ...w, [colKey]: Math.max(36, startW + (ev.clientX - startX)) }))
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      setWidths((w) => { persist(w); return w })
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  function toggleSort(col: ColumnDef<T>) {
    if (!col.sortValue) return
    const first: 1 | -1 = col.descFirst ? -1 : 1
    setSort((cur) => {
      if (!cur || cur.key !== col.key) return { key: col.key, dir: first }
      if (cur.dir === first) return { key: col.key, dir: (first === 1 ? -1 : 1) as 1 | -1 }
      return null   // third click clears back to the page's own order
    })
  }

  function reset() {
    const base = Object.fromEntries(columns.map((c) => [c.key, c.width]))
    setWidths(base)
    persist(base)
    setSort(null)
  }

  /** Sorted copy, or the original array untouched when no column is active. */
  function sortRows(rows: T[]): T[] {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    return [...rows].sort((a, b) => compare(col.sortValue!(a), col.sortValue!(b), sort.dir))
  }

  const ColGroup = () => (
    <colgroup>
      {columns.map((c) => (
        <col key={c.key} style={{ width: `${widths[c.key] ?? c.width}px` }} />
      ))}
    </colgroup>
  )

  const Head = () => (
    <thead>
      <tr>
        {columns.map((c, i) => {
          const active = sort?.key === c.key
          const align = c.align ?? 'left'
          return (
            <th key={c.key} style={{ ...th, textAlign: align }}>
              {c.sortValue ? (
                <button
                  onClick={() => toggleSort(c)}
                  style={{
                    border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                    font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
                    color: active ? '#111827' : 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: '3px', width: '100%',
                    justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
                  }}
                >
                  {c.label}
                  <span style={{ fontSize: '9px', opacity: active ? 1 : 0.26 }}>
                    {active ? (sort!.dir === 1 ? '▲' : '▼') : '▾'}
                  </span>
                </button>
              ) : (
                c.label
              )}
              {i < columns.length - 1 && (
                <span
                  onMouseDown={(e) => startResize(c.key, e)}
                  title="Drag to resize"
                  style={{
                    position: 'absolute', top: 0, right: 0, width: '7px', height: '100%',
                    cursor: 'col-resize', userSelect: 'none', borderRight: '1px solid #e5e7eb',
                  }}
                />
              )}
            </th>
          )
        })}
      </tr>
    </thead>
  )

  /** Total of the current widths — a sensible min-width for the table. */
  const minWidth = useMemo(
    () => columns.reduce((s, c) => s + (widths[c.key] ?? c.width), 0),
    [columns, widths]
  )

  const ResetButton = () => (
    <button
      onClick={reset}
      title="Reset column widths and sorting"
      style={{
        border: 'none', background: 'none', cursor: 'pointer',
        fontSize: '11.5px', color: '#9ca3af', padding: 0, textDecoration: 'underline',
      }}
    >
      Reset columns
    </button>
  )

  return { widths, sort, sortRows, ColGroup, Head, ResetButton, reset, minWidth, startResize, toggleSort }
}
