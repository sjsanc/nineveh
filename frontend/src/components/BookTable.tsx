import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import {
  ColumnDef,
  ColumnSizingState,
  FilterFn,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Icon, Menu, MenuItem, MenuDivider } from '@blueprintjs/core'
import { Book, BookFile } from '../types'
import { DeviceInfo } from '../types'
import { FORMAT_COLORS, formatDate, deviceColor, buildIndex, matchBook } from '../utils'

const Dash = () => <span className="text-zinc-600">—</span>

interface Props {
  data: Book[]
  selectedBookId?: number
  selectedBookIds?: Set<number>
  onSelectBook?: (book: Book) => void
  onSelectionChange?: (ids: Set<number>, focused: Book | null) => void
  onDoubleClickBook?: (book: Book) => void
  devices?: DeviceInfo[]
  activeDeviceID?: string | null
  deviceLetterMap?: Map<string, string>
  deviceBooks?: BookFile[]
  onSendToDevice?: (bookIds: number[], deviceId: string) => void
  onEditBook?: (book: Book) => void
  onFetchMetadata?: (book: Book) => void
  onToggleRead?: (bookIds: number[], isRead: boolean) => void
  onRemoveBooks?: (ids: number[]) => void
  columnWidths?: Record<string, number>
  onColumnWidthsChange?: (widths: Record<string, number>) => void
}

const bookFilterFn: FilterFn<Book> = (row, _colId, value) => {
  const q = String(value).toLowerCase()
  if (!q) return true
  const b = row.original
  return (
    b.Title.toLowerCase().includes(q) ||
    b.Authors.some(a => a.toLowerCase().includes(q)) ||
    (b.Series?.toLowerCase().includes(q) ?? false)
  )
}

const COLUMNS: ColumnDef<Book>[] = [
  {
    id: 'index',
    header: '#',
    size: 48,
    minSize: 48,
    enableSorting: false,
    cell: () => null,
  },
  {
    id: 'isRead',
    header: 'Read',
    accessorKey: 'IsRead',
    size: 56,
    minSize: 48,
    enableSorting: true,
    cell: ({ getValue }) =>
      getValue<boolean>() ? (
        <Icon icon="endorsed" size={14} className="text-yellow-400" />
      ) : (
        <Dash />
      ),
  },
  {
    id: 'title',
    header: 'Title',
    accessorKey: 'Title',
    size: 280,
    minSize: 100,
  },
  {
    id: 'authors',
    header: 'Author(s)',
    accessorFn: (row) => row.Authors.join(', '),
    size: 160,
    minSize: 80,
  },
  {
    id: 'series',
    header: 'Series',
    accessorFn: (row) => (row.Series ? `${row.Series} #${row.SeriesIndex}` : ''),
    size: 150,
    minSize: 80,
    cell: ({ getValue }) => getValue<string>() || <Dash />,
  },
  {
    id: 'tags',
    header: 'Tags',
    accessorKey: 'Tags',
    enableSorting: false,
    size: 150,
    minSize: 80,
    cell: ({ getValue }) => {
      const tags = getValue<string[]>()
      if (!tags?.length) return <Dash />
      const visible = tags.slice(0, 2)
      const overflow = tags.length - visible.length
      return (
        <div className="flex gap-1 items-center min-w-0">
          {visible.map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 truncate max-w-[72px]"
            >
              {t}
            </span>
          ))}
          {overflow > 0 && <span className="text-[10px] text-zinc-500 shrink-0">+{overflow}</span>}
        </div>
      )
    },
  },
  {
    id: 'formats',
    header: 'Formats',
    accessorFn: (row) => row.Formats,
    enableSorting: false,
    size: 110,
    minSize: 70,
    cell: ({ getValue }) => {
      const formats = getValue<Book['Formats']>()
      if (!formats?.length) return <Dash />
      return (
        <div className="flex gap-1">
          {formats.map((f) => (
            <span
              key={f.Format}
              className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-mono tracking-wide shrink-0 ${FORMAT_COLORS[f.Format] ?? 'bg-zinc-600'} text-white`}
            >
              {f.Format}
            </span>
          ))}
        </div>
      )
    },
  },
  {
    id: 'rating',
    header: 'Rating',
    accessorKey: 'Rating',
    size: 80,
    minSize: 60,
    cell: ({ getValue }) => {
      const r = getValue<number>()
      return r > 0 ? (
        <span className="tracking-tight text-amber-400">{'★'.repeat(r)}</span>
      ) : (
        <Dash />
      )
    },
  },
  {
    id: 'datePublished',
    header: 'Published',
    accessorKey: 'DatePublished',
    size: 100,
    minSize: 70,
    cell: ({ getValue }) => {
      const d = formatDate(getValue<string>())
      return d ?? <Dash />
    },
  },
  {
    id: 'dateAdded',
    header: 'Added',
    accessorKey: 'DateAdded',
    size: 100,
    minSize: 70,
    cell: ({ getValue }) => {
      const d = formatDate(getValue<string>())
      return d ?? <Dash />
    },
  },
]

export function BookTable({
  data,
  selectedBookId,
  selectedBookIds = new Set(),
  onSelectBook,
  onSelectionChange,
  onDoubleClickBook,
  devices = [],
  activeDeviceID,
  deviceLetterMap,
  deviceBooks = [],
  onSendToDevice,
  onEditBook,
  onFetchMetadata,
  onToggleRead,
  onRemoveBooks,
  columnWidths = {},
  onColumnWidthsChange,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [inputValue, setInputValue] = useState('')
  const [globalFilter, setGlobalFilter] = useState('')
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(columnWidths)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const lastClickedIndex = useRef<number | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!onColumnWidthsChange) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onColumnWidthsChange(columnSizing), 500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [columnSizing])

  const onDeviceIds = useMemo<Set<number>>(() => {
    if (!deviceBooks.length) return new Set()
    const index = buildIndex(data)
    const ids = new Set<number>()
    for (const f of deviceBooks) {
      const match = matchBook(f.Path, index)
      if (match) ids.add(match.ID as number)
    }
    return ids
  }, [deviceBooks, data])

  const columns = useMemo<ColumnDef<Book>[]>(() => {
    if (!deviceBooks.length) return COLUMNS
    const letter = activeDeviceID ? (deviceLetterMap?.get(activeDeviceID) ?? '?') : '?'
    const color = deviceColor(letter)
    const onDeviceCol: ColumnDef<Book> = {
      id: 'onDevice',
      header: 'On Device',
      size: 80,
      minSize: 64,
      enableSorting: true,
      accessorFn: (row) => onDeviceIds.has(row.ID as number),
      cell: ({ getValue }) =>
        getValue<boolean>() ? (
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold text-zinc-900"
            style={{ backgroundColor: color }}
          >
            {letter}
          </span>
        ) : (
          <Dash />
        ),
    }
    return [COLUMNS[0], onDeviceCol, ...COLUMNS.slice(1)]
  }, [deviceBooks.length, onDeviceIds, activeDeviceID, deviceLetterMap])

  useEffect(() => {
    const t = setTimeout(() => setGlobalFilter(inputValue), 200)
    return () => clearTimeout(t)
  }, [inputValue])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerWidth(el.getBoundingClientRect().width)
    const obs = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!ctxMenu) return
    function onPointerDown(e: PointerEvent) {
      const menu = document.getElementById('book-ctx-menu')
      if (menu && !menu.contains(e.target as Node)) {
        setCtxMenu(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [ctxMenu])

  const table = useReactTable({
    data,
    columns,
    columnResizeMode: 'onChange',
    state: { sorting, globalFilter, columnSizing },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnSizingChange: setColumnSizing,
    globalFilterFn: bookFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const rows = table.getRowModel().rows

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 36,
    overscan: 5,
  })
  const virtualItems = rowVirtualizer.getVirtualItems()
  const virtualTotalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualItems[0]?.start ?? 0
  const paddingBottom = virtualTotalSize - (virtualItems.at(-1)?.end ?? 0)

  const colTotalSize = table.getTotalSize()
  const colWidth = (size: number) =>
    containerWidth > 0 && colTotalSize > 0 ? (size / colTotalSize) * containerWidth : size

  function handleRowClick(e: React.MouseEvent, book: Book, rowIndex: number) {
    if (!onSelectionChange) {
      onSelectBook?.(book)
      return
    }

    if (e.shiftKey && lastClickedIndex.current !== null) {
      const lo = Math.min(lastClickedIndex.current, rowIndex)
      const hi = Math.max(lastClickedIndex.current, rowIndex)
      const rangeIds = new Set(rows.slice(lo, hi + 1).map(r => r.original.ID as number))
      onSelectionChange(rangeIds, book)
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedBookIds)
      if (next.has(book.ID as number)) {
        next.delete(book.ID as number)
      } else {
        next.add(book.ID as number)
      }
      lastClickedIndex.current = rowIndex
      onSelectionChange(next, book)
    } else {
      lastClickedIndex.current = rowIndex
      onSelectionChange(new Set([book.ID as number]), book)
    }
    onSelectBook?.(book)
  }

  function handleContextMenu(e: React.MouseEvent, book: Book, rowIndex: number) {
    e.preventDefault()
    if (!selectedBookIds.has(book.ID as number)) {
      onSelectionChange?.(new Set([book.ID as number]), book)
      onSelectBook?.(book)
      lastClickedIndex.current = rowIndex
    }
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  function buildDeviceMenu() {
    if (devices.length === 0) {
      return <MenuItem text="Send to Device" disabled />
    }
    if (devices.length === 1) {
      return (
        <MenuItem
          text={`Send to "${devices[0].Name}"`}
          onClick={() => {
            onSendToDevice?.([...selectedBookIds] as number[], devices[0].ID)
            setCtxMenu(null)
          }}
        />
      )
    }
    return (
      <MenuItem text="Send to Device">
        {devices.map(d => (
          <MenuItem
            key={d.ID}
            text={d.Name}
            onClick={() => {
              onSendToDevice?.([...selectedBookIds] as number[], d.ID)
              setCtxMenu(null)
            }}
          />
        ))}
      </MenuItem>
    )
  }

  const selectionCount = selectedBookIds.size

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="border-b border-zinc-800 shrink-0 flex items-stretch">
        <span className="flex items-center pl-3 pr-2 shrink-0 text-zinc-500">
          <Icon icon="search" size={16} />
        </span>
        <input
          type="text"
          placeholder="Search title, author or series…"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          className="flex-1 text-[16px] line-height bg-transparent text-zinc-200 placeholder-zinc-500 outline-2 outline-hidden m-1 h-8 pr-3"
        />
        {selectionCount > 1 && (
          <span className="flex items-center pr-3 shrink-0">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">
              {selectionCount} selected
            </span>
          </span>
        )}
      </div>
      <div ref={containerRef} className="overflow-x-hidden overflow-y-auto flex-1">
        <table
          className="text-sm text-zinc-200"
          style={{
            width: containerWidth || '100%',
            tableLayout: 'fixed',
            borderCollapse: 'separate',
            borderSpacing: 0,
          }}
        >
          <thead className="sticky top-0 z-10 bg-zinc-900">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="relative text-left px-3 py-2 font-medium text-zinc-400 border-b border-zinc-700 select-none whitespace-nowrap"
                    style={{ width: colWidth(header.getSize()) }}
                  >
                    <div
                      className={`flex items-center justify-between gap-1 ${header.column.getCanSort() ? 'cursor-pointer hover:text-zinc-100' : ''}`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' && <Icon icon="sort-asc" size={12} className="text-zinc-400" />}
                      {header.column.getIsSorted() === 'desc' && <Icon icon="sort-desc" size={12} className="text-zinc-400" />}
                    </div>
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none bg-zinc-600 opacity-0 hover:opacity-100 active:opacity-100 transition-opacity"
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && <tr><td style={{ height: paddingTop }} /></tr>}
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index]
              const id = row.original.ID as number
              const isSelected = selectedBookIds.has(id) || row.original.ID === selectedBookId
              return (
                <tr
                  key={row.id}
                  onClick={(e) => handleRowClick(e, row.original, virtualRow.index)}
                  onDoubleClick={() => onDoubleClickBook?.(row.original)}
                  onContextMenu={(e) => handleContextMenu(e, row.original, virtualRow.index)}
                  className={`border-b border-zinc-800/60 cursor-pointer transition-colors select-none ${
                    isSelected
                      ? 'bg-zinc-700/60'
                      : virtualRow.index % 2 !== 0
                      ? 'bg-zinc-900/30 hover:bg-zinc-800/60'
                      : 'hover:bg-zinc-800/60'
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-2 truncate"
                      style={{ width: colWidth(cell.column.getSize()) }}
                    >
                      {cell.column.id === 'index'
                        ? isSelected && selectionCount > 1
                          ? <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 shrink-0"><svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5"><path d="M2 6l2.5 2.5L10 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
                          : <span className="text-zinc-500">{virtualRow.index + 1}</span>
                        : flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
            {paddingBottom > 0 && <tr><td style={{ height: paddingBottom }} /></tr>}
          </tbody>
        </table>
      </div>

      {ctxMenu && ReactDOM.createPortal(
        <div
          id="book-ctx-menu"
          className="bp5-dark"
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000 }}
        >
          <Menu>
            <MenuItem
              disabled
              text={`${selectionCount} book${selectionCount === 1 ? '' : 's'} selected`}
            />
            <MenuDivider />
            {selectionCount === 1 && (
              <MenuItem
                text="Edit Metadata"
                onClick={() => {
                  const book = rows.find(r => selectedBookIds.has(r.original.ID as number))?.original ?? null
                  if (book) onEditBook?.(book)
                  setCtxMenu(null)
                }}
              />
            )}
            {selectionCount === 1 && (
              <MenuItem
                text="Fetch Metadata"
                icon="cloud-download"
                onClick={() => {
                  const book = rows.find(r => selectedBookIds.has(r.original.ID as number))?.original ?? null
                  if (book) onFetchMetadata?.(book)
                  setCtxMenu(null)
                }}
              />
            )}
            {(() => {
              const selectedBooks = rows.filter(r => selectedBookIds.has(r.original.ID as number)).map(r => r.original)
              const allRead = selectedBooks.length > 0 && selectedBooks.every(b => b.IsRead)
              const label = allRead ? 'Mark as Unread' : 'Mark as Read'
              return (
                <MenuItem
                  text={label}
                  onClick={() => {
                    onToggleRead?.([...selectedBookIds] as number[], !allRead)
                    setCtxMenu(null)
                  }}
                />
              )
            })()}
            {buildDeviceMenu()}
            <MenuDivider />
            <MenuItem
              text={`Remove ${selectionCount} book${selectionCount === 1 ? '' : 's'} from library`}
              intent="danger"
              onClick={() => {
                onRemoveBooks?.([...selectedBookIds] as number[])
                setCtxMenu(null)
              }}
            />
          </Menu>
        </div>,
        document.body
      )}
    </div>
  )
}
