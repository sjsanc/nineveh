import { useEffect, useMemo, useRef, useState } from 'react'
import { BookGrid } from './BookGrid'
import ReactDOM from 'react-dom'
import {
  ColumnDef,
  ColumnSizingState,
  VisibilityState,
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
import { formatDate, deviceColor, buildIndex, matchBook } from '../utils'
import { useContainerWidth } from '../lib/useContainerWidth'
import { useShiftCtrlSelect } from '../lib/useShiftCtrlSelect'
import { useDismissableContextMenu } from '../lib/useDismissableContextMenu'
import { makeColWidth, virtualPadding } from '../lib/virtualTable'
import { VirtualTableHead } from './table/VirtualTableHead'
import { Dash } from './table/Dash'
import { SelectionCheckmark } from './table/SelectionCheckmark'
import { Rating } from './Rating'

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
  onOpenBook?: (bookId: number, format: string) => void
  columnWidths?: Record<string, number>
  onColumnWidthsChange?: (widths: Record<string, number>) => void
  visibleColumns?: string[]
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

const MIN_TABLE_WIDTH = 640

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
    id: 'rating',
    header: 'Rating',
    accessorKey: 'Rating',
    size: 80,
    minSize: 60,
    cell: ({ getValue }) => {
      const r = getValue<number>()
      return r > 0 ? <Rating value={r} size="sm" /> : <Dash />
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
  onOpenBook,
  columnWidths = {},
  onColumnWidthsChange,
  visibleColumns,
}: Props) {
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(
    () => (localStorage.getItem('viewMode') as 'table' | 'grid') || 'table'
  )
  const [sorting, setSorting] = useState<SortingState>([])
  const [inputValue, setInputValue] = useState('')
  const [globalFilter, setGlobalFilter] = useState('')
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(columnWidths)

  const columnVisibility = useMemo<VisibilityState>(() => {
    if (!visibleColumns?.length) return {}
    return Object.fromEntries(
      COLUMNS
        .filter(col => col.id !== 'index')
        .map(col => [col.id!, visibleColumns.includes(col.id!)])
    )
  }, [visibleColumns])
  const { ref: containerRef, width: containerWidth } = useContainerWidth<HTMLDivElement>()
  const { lastClickedIndex, computeNext } = useShiftCtrlSelect()
  const [ctxMenu, setCtxMenu] = useDismissableContextMenu('book-ctx-menu')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!onColumnWidthsChange) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onColumnWidthsChange(columnSizing), 500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [columnSizing])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const onDeviceIds = useMemo<Set<number>>(() => {
    if (!deviceBooks.length) return new Set()
    const index = buildIndex(data)
    const ids = new Set<number>()
    for (const f of deviceBooks) {
      const match = matchBook(f, index)
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

  const table = useReactTable({
    data,
    columns,
    columnResizeMode: 'onChange',
    state: { sorting, globalFilter, columnSizing, columnVisibility },
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
  const { items: virtualItems, paddingTop, paddingBottom } = virtualPadding(rowVirtualizer)
  const effectiveWidth = Math.max(containerWidth || 0, MIN_TABLE_WIDTH)
  const colWidth = makeColWidth(table, effectiveWidth)

  function getCursorIndex(): number {
    if (selectedBookId == null) return -1
    return rows.findIndex(r => r.original.ID === selectedBookId)
  }

  function handleTableKeyDown(e: React.KeyboardEvent) {
    if (!rows.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const current = getCursorIndex()
      const newIdx = current === -1 ? 0 : e.key === 'ArrowDown'
        ? Math.min(current + 1, rows.length - 1)
        : Math.max(current - 1, 0)
      const book = rows[newIdx].original
      onSelectBook?.(book)
      onSelectionChange?.(new Set([book.ID as number]), book)
      rowVirtualizer.scrollToIndex(newIdx, { align: 'auto' })
    } else if (e.key === 'Enter') {
      const current = getCursorIndex()
      if (current >= 0) onDoubleClickBook?.(rows[current].original)
    } else if (e.key === 'Escape') {
      ;(e.currentTarget as HTMLElement).blur()
    }
  }

  function handleRowClick(e: React.MouseEvent, book: Book, rowIndex: number) {
    if (!onSelectionChange) {
      onSelectBook?.(book)
      containerRef.current?.focus({ preventScroll: true })
      return
    }
    const next = computeNext(
      e,
      book.ID as number,
      rowIndex,
      selectedBookIds,
      (lo, hi) => rows.slice(lo, hi + 1).map(r => r.original.ID as number),
    )
    onSelectionChange(next, book)
    onSelectBook?.(book)
    containerRef.current?.focus({ preventScroll: true })
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
      return <MenuItem text="Send to Device" icon="upload" disabled />
    }
    if (devices.length === 1) {
      return (
        <MenuItem
          text={`Send to "${devices[0].Name}"`}
          icon="upload"
          onClick={() => {
            onSendToDevice?.([...selectedBookIds] as number[], devices[0].ID)
            setCtxMenu(null)
          }}
        />
      )
    }
    return (
      <MenuItem text="Send to Device" icon="upload">
        {devices.map(d => (
          <MenuItem
            key={d.ID}
            text={d.Name}
            icon="desktop"
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
          ref={searchInputRef}
          type="text"
          placeholder="Search title, author or series…"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.preventDefault()
              if (inputValue) setInputValue('')
              else e.currentTarget.blur()
            }
          }}
          className="flex-1 text-[16px] line-height bg-transparent text-zinc-200 placeholder-zinc-500 outline-2 outline-hidden m-1 h-8"
        />
        {inputValue && (
          <button
            onClick={() => setInputValue('')}
            className="flex items-center justify-center w-7 h-7 my-auto mr-1 shrink-0 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Clear search"
          >
            <Icon icon="cross" size={14} />
          </button>
        )}
        {selectionCount > 1 && (
          <span className="flex items-center pr-2 shrink-0">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">
              {selectionCount} selected
            </span>
          </span>
        )}
        <div className="flex items-center gap-0.5 px-2 border-l border-zinc-800 shrink-0">
          <button
            onClick={() => { setViewMode('table'); localStorage.setItem('viewMode', 'table') }}
            className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${viewMode === 'table' ? 'text-zinc-200 bg-zinc-700' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'}`}
            title="Table view"
          >
            <Icon icon="th-list" size={14} />
          </button>
          <button
            onClick={() => { setViewMode('grid'); localStorage.setItem('viewMode', 'grid') }}
            className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${viewMode === 'grid' ? 'text-zinc-200 bg-zinc-700' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'}`}
            title="Grid view"
          >
            <Icon icon="th" size={14} />
          </button>
        </div>
      </div>
      {viewMode === 'grid' ? (
        <BookGrid
          books={rows.map(r => r.original)}
          selectedBookId={selectedBookId}
          selectedBookIds={selectedBookIds}
          onSelectBook={onSelectBook}
          onSelectionChange={onSelectionChange}
          onDoubleClickBook={onDoubleClickBook}
          devices={devices}
          activeDeviceID={activeDeviceID}
          deviceLetterMap={deviceLetterMap}
          deviceBooks={deviceBooks}
          onSendToDevice={onSendToDevice}
          onEditBook={onEditBook}
          onFetchMetadata={onFetchMetadata}
          onToggleRead={onToggleRead}
          onRemoveBooks={onRemoveBooks}
          onOpenBook={onOpenBook}
        />
      ) : null}
      <div ref={containerRef} tabIndex={0} onKeyDown={handleTableKeyDown} className={`overflow-x-auto overflow-y-auto flex-1 outline-none ${viewMode === 'grid' ? 'hidden' : ''}`}>
        <table
          className="text-sm text-zinc-200"
          style={{
            width: effectiveWidth || '100%',
            minWidth: MIN_TABLE_WIDTH,
            tableLayout: 'fixed',
            borderCollapse: 'separate',
            borderSpacing: 0,
          }}
        >
          <VirtualTableHead table={table} colWidth={colWidth} />
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
                          ? <SelectionCheckmark />
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
          className="bp6-dark"
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000 }}
        >
          <Menu>
            <MenuItem
              disabled
              text={`${selectionCount} book${selectionCount === 1 ? '' : 's'} selected`}
            />
            <MenuDivider />
            {selectionCount === 1 && (() => {
              const book = rows.find(r => selectedBookIds.has(r.original.ID as number))?.original
              const formats = book?.Formats ?? []
              if (!formats.length) return null
              if (formats.length === 1) {
                return (
                  <MenuItem
                    text={`Open (${formats[0].Format.toUpperCase()})`}
                    icon="document-open"
                    onClick={() => {
                      onOpenBook?.(book!.ID as number, formats[0].Format)
                      setCtxMenu(null)
                    }}
                  />
                )
              }
              return (
                <MenuItem text="Open" icon="document-open">
                  {formats.map(f => (
                    <MenuItem
                      key={f.Format}
                      text={f.Format.toUpperCase()}
                      onClick={() => {
                        onOpenBook?.(book!.ID as number, f.Format)
                        setCtxMenu(null)
                      }}
                    />
                  ))}
                </MenuItem>
              )
            })()}
            <MenuDivider />
            {selectionCount === 1 && (
              <MenuItem
                text="Edit Metadata"
                icon="edit"
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
              const label = allRead
                ? (selectionCount > 1 ? 'Mark All as Unread' : 'Mark as Unread')
                : (selectionCount > 1 ? 'Mark All as Read' : 'Mark as Read')
              return (
                <MenuItem
                  text={label}
                  icon={allRead ? 'cross' : 'tick'}
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
              icon="trash"
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
