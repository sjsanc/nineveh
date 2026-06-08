import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Icon } from '@blueprintjs/core'
import { Menu, MenuItem, MenuDivider } from '@blueprintjs/core'
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Book, BookFile, DeviceInfo } from '../types'
import { FORMAT_COLORS, formatSize, stemOf, buildIndex, matchBook } from '../utils'

const Dash = () => <span className="text-zinc-600">—</span>

interface Props {
  data: BookFile[]
  books: Book[]
  device?: DeviceInfo
  onRemoveFromDevice?: (paths: string[]) => void
  onSelectFile?: (file: BookFile | null) => void
}

function makeColumns(index: Map<string, Book>): ColumnDef<BookFile>[] {
  return [
    {
      id: 'index',
      header: '#',
      size: 48,
      minSize: 48,
      enableSorting: false,
      cell: ({ row }) => <span className="text-zinc-500">{row.index + 1}</span>,
    },
    {
      id: 'title',
      header: 'Title',
      accessorFn: (row) => matchBook(row.Path, index)?.Title ?? (row.Title || stemOf(row.Path)),
      size: 280,
      minSize: 100,
    },
    {
      id: 'authors',
      header: 'Author(s)',
      accessorFn: (row) => matchBook(row.Path, index)?.Authors?.join(', ') ?? row.Authors?.join(', ') ?? '',
      size: 160,
      minSize: 80,
      cell: ({ getValue }) => getValue<string>() || <Dash />,
    },
    {
      id: 'format',
      header: 'Format',
      accessorKey: 'Format',
      size: 90,
      minSize: 70,
      cell: ({ getValue }) => {
        const fmt = getValue<string>()
        return (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-mono tracking-wide shrink-0 ${FORMAT_COLORS[fmt] ?? 'bg-zinc-600'} text-white`}
          >
            {fmt}
          </span>
        )
      },
    },
    {
      id: 'inLibrary',
      header: 'In Library',
      enableSorting: false,
      size: 80,
      minSize: 60,
      accessorFn: (row) => matchBook(row.Path, index) != null,
      cell: ({ getValue }) =>
        getValue<boolean>() ? (
          <Icon icon="tick-circle" size={14} className="text-emerald-500" />
        ) : (
          <Dash />
        ),
    },
    {
      id: 'size',
      header: 'Size',
      accessorKey: 'Size',
      size: 90,
      minSize: 70,
      cell: ({ getValue }) => (
        <span className="text-zinc-400">{formatSize(getValue<number>())}</span>
      ),
    },
  ]
}

export function DeviceTable({ data, books, device, onRemoveFromDevice, onSelectFile }: Props) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const lastClickedIndex = useRef<number | null>(null)

  const index = useMemo(() => buildIndex(books), [books])
  const columns = useMemo(() => makeColumns(index), [index])

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
      const menu = document.getElementById('device-ctx-menu')
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
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
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

  function handleRowClick(e: React.MouseEvent, path: string, rowIndex: number) {
    if (e.shiftKey && lastClickedIndex.current !== null) {
      const lo = Math.min(lastClickedIndex.current, rowIndex)
      const hi = Math.max(lastClickedIndex.current, rowIndex)
      const next = new Set(rows.slice(lo, hi + 1).map(r => r.original.Path))
      setSelectedPaths(next)
      if (next.size === 1) {
        onSelectFile?.(data.find(f => f.Path === path) ?? null)
      } else {
        onSelectFile?.(null)
      }
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedPaths)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      setSelectedPaths(next)
      lastClickedIndex.current = rowIndex
      if (next.size === 1) {
        onSelectFile?.(data.find(f => f.Path === [...next][0]) ?? null)
      } else {
        onSelectFile?.(null)
      }
    } else {
      lastClickedIndex.current = rowIndex
      setSelectedPaths(new Set([path]))
      onSelectFile?.(data.find(f => f.Path === path) ?? null)
    }
  }

  function handleContextMenu(e: React.MouseEvent, path: string, rowIndex: number) {
    e.preventDefault()
    if (!selectedPaths.has(path)) {
      setSelectedPaths(new Set([path]))
      lastClickedIndex.current = rowIndex
      onSelectFile?.(data.find(f => f.Path === path) ?? null)
    }
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  const selectionCount = selectedPaths.size

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {device && (
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-8 bg-zinc-900/50 shrink-0">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Device</span>
            <span className="text-sm text-zinc-200 font-medium">{device.Name}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Books</span>
            <span className="text-sm text-zinc-200 font-medium">{data.length}</span>
          </div>
          {device.FreeSpace > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Free Space</span>
              <span className="text-sm text-zinc-200 font-medium">{formatSize(device.FreeSpace)}</span>
            </div>
          )}
        </div>
      )}
    <div ref={containerRef} className="overflow-x-hidden overflow-y-auto flex-1 w-full">
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
          No books found on device
        </div>
      ) : (
        <table
          className="text-sm text-zinc-200"
          style={{ width: containerWidth || '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}
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
              const path = row.original.Path
              const isSelected = selectedPaths.has(path)
              return (
                <tr
                  key={row.id}
                  onClick={(e) => handleRowClick(e, path, virtualRow.index)}
                  onContextMenu={(e) => handleContextMenu(e, path, virtualRow.index)}
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
      )}

      {ctxMenu && ReactDOM.createPortal(
        <div
          id="device-ctx-menu"
          className="bp5-dark"
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000 }}
        >
          <Menu>
            <MenuItem
              disabled
              text={`${selectionCount} file${selectionCount === 1 ? '' : 's'} selected`}
            />
            <MenuDivider />
            <MenuItem
              text={`Remove ${selectionCount} file${selectionCount === 1 ? '' : 's'} from device`}
              intent="danger"
              onClick={() => {
                onRemoveFromDevice?.([...selectedPaths])
                setSelectedPaths(new Set())
                onSelectFile?.(null)
                setCtxMenu(null)
              }}
            />
          </Menu>
        </div>,
        document.body
      )}
    </div>
    </div>
  )
}
