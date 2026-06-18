type KeyEvent = {
  key: string
  preventDefault(): void
  currentTarget: EventTarget | null
}

export function makeTableKeyDown<T>(
  rows: { original: T }[],
  getCursorIndex: () => number,
  onSelect: (item: T, index: number) => void,
  scrollToIndex: (index: number, opts: { align: 'start' | 'center' | 'end' | 'auto' }) => void,
  onActivate?: (item: T) => void,
): (e: KeyEvent) => void {
  return (e: KeyEvent) => {
    if (!rows.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const current = getCursorIndex()
      const newIdx = current === -1 ? 0 : e.key === 'ArrowDown'
        ? Math.min(current + 1, rows.length - 1)
        : Math.max(current - 1, 0)
      onSelect(rows[newIdx].original, newIdx)
      scrollToIndex(newIdx, { align: 'auto' as const })
    } else if (e.key === 'Enter' && onActivate) {
      const current = getCursorIndex()
      if (current >= 0) onActivate(rows[current].original)
    } else if (e.key === 'Escape') {
      ;(e.currentTarget as HTMLElement).blur()
    }
  }
}
