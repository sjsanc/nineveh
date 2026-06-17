import { useMemo } from 'react'
import ReactDOM from 'react-dom'
import { Icon, Menu, MenuItem, MenuDivider } from '@blueprintjs/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Book, BookFile, DeviceInfo } from '../types'
import { deviceColor, buildIndex, matchBook } from '../utils'
import { useShiftCtrlSelect } from '../lib/useShiftCtrlSelect'
import { useDismissableContextMenu } from '../lib/useDismissableContextMenu'
import { useCoverImage } from '../lib/useCoverImage'
import { useContainerWidth } from '../lib/useContainerWidth'
import { GetCoverData } from '../../wailsjs/go/main/App'

const CARD_MIN_WIDTH = 220
const MIN_COLS = 3
const GAP = 12
const PADDING = 16
const MIN_GRID_WIDTH = MIN_COLS * CARD_MIN_WIDTH + (MIN_COLS - 1) * GAP + PADDING * 2

interface Props {
  books: Book[]
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
}

interface CardProps {
  book: Book
  index: number
  isSelected: boolean
  isOnDevice: boolean
  deviceLetter: string
  devColor: string
  onClick: (e: React.MouseEvent, book: Book, index: number) => void
  onDoubleClick: (book: Book) => void
  onContextMenu: (e: React.MouseEvent, book: Book, index: number) => void
}

function CoverCard({ book, index, isSelected, isOnDevice, deviceLetter, devColor, onClick, onDoubleClick, onContextMenu }: CardProps) {
  // Virtualizer only mounts visible cards, so cover loads are always in-viewport
  const coverSrc = useCoverImage(book.CoverPath || undefined, GetCoverData)

  return (
    <div
      className={`aspect-[2/3] rounded overflow-hidden cursor-pointer select-none relative ${
        isSelected
          ? 'ring-2 ring-blue-500'
          : 'ring-1 ring-zinc-700/50 hover:ring-zinc-600'
      }`}
      onClick={e => onClick(e, book, index)}
      onDoubleClick={() => onDoubleClick(book)}
      onContextMenu={e => onContextMenu(e, book, index)}
    >
      <div className="w-full h-full bg-zinc-800">
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={book.Title}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-3 text-center">
            <p className="text-xs font-medium text-zinc-300 line-clamp-4 leading-snug">{book.Title}</p>
            {book.Authors.length > 0 && (
              <p className="text-[11px] text-zinc-500 line-clamp-2 leading-snug">{book.Authors.join(', ')}</p>
            )}
          </div>
        )}
      </div>
      {book.IsRead && (
        <span className="absolute top-1 left-1">
          <Icon icon="endorsed" size={14} className="text-yellow-400" />
        </span>
      )}
      {isOnDevice && (
        <span
          className="absolute top-1 right-1 w-5 h-5 rounded text-xs font-bold text-zinc-900 flex items-center justify-center"
          style={{ backgroundColor: devColor }}
        >
          {deviceLetter}
        </span>
      )}
    </div>
  )
}

export function BookGrid({
  books,
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
}: Props) {
  const { lastClickedIndex, computeNext } = useShiftCtrlSelect()
  const [ctxMenu, setCtxMenu] = useDismissableContextMenu('book-grid-ctx-menu')
  const { ref: containerRef, width: containerWidth } = useContainerWidth<HTMLDivElement>()

  // When the window is narrower than MIN_COLS cards, use MIN_GRID_WIDTH so rows
  // overflow and the outer container scrolls horizontally.
  const effectiveWidth = Math.max(containerWidth, MIN_GRID_WIDTH)
  const cols = Math.max(MIN_COLS, Math.floor((effectiveWidth - PADDING * 2 + GAP) / (CARD_MIN_WIDTH + GAP)))
  const cardWidth = (effectiveWidth - PADDING * 2 - GAP * (cols - 1)) / cols

  // Covers are portrait 2:3; row height = cover height + inter-row gap + rounding buffer
  const rowHeight = Math.ceil(cardWidth * 1.5) + GAP + 4

  const bookRows = useMemo<Book[][]>(() => {
    const result: Book[][] = []
    for (let i = 0; i < books.length; i += cols) {
      result.push(books.slice(i, i + cols))
    }
    return result
  }, [books, cols])

  const rowVirtualizer = useVirtualizer({
    count: bookRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
    paddingStart: PADDING,
    paddingEnd: PADDING,
  })

  const onDeviceIds = useMemo<Set<number>>(() => {
    if (!deviceBooks.length) return new Set()
    const index = buildIndex(books)
    const ids = new Set<number>()
    for (const f of deviceBooks) {
      const match = matchBook(f, index)
      if (match) ids.add(match.ID as number)
    }
    return ids
  }, [deviceBooks, books])

  const letter = activeDeviceID ? (deviceLetterMap?.get(activeDeviceID) ?? '?') : '?'
  const color = deviceColor(letter)

  function handleClick(e: React.MouseEvent, book: Book, idx: number) {
    if (!onSelectionChange) {
      onSelectBook?.(book)
      return
    }
    const next = computeNext(
      e,
      book.ID as number,
      idx,
      selectedBookIds,
      (lo, hi) => books.slice(lo, hi + 1).map(b => b.ID as number),
    )
    onSelectionChange(next, book)
    onSelectBook?.(book)
  }

  function handleContextMenu(e: React.MouseEvent, book: Book, idx: number) {
    e.preventDefault()
    if (!selectedBookIds.has(book.ID as number)) {
      onSelectionChange?.(new Set([book.ID as number]), book)
      onSelectBook?.(book)
      lastClickedIndex.current = idx
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
    <div ref={containerRef} className="overflow-x-auto overflow-y-auto flex-1">
      <div style={{ height: rowVirtualizer.getTotalSize(), minWidth: MIN_GRID_WIDTH, position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.index}
            style={{
              position: 'absolute',
              top: virtualRow.start,
              left: PADDING,
              right: PADDING,
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: `${GAP}px`,
            }}
          >
            {bookRows[virtualRow.index].map((book, colIdx) => {
              const globalIdx = virtualRow.index * cols + colIdx
              return (
                <CoverCard
                  key={book.ID as number}
                  book={book}
                  index={globalIdx}
                  isSelected={selectedBookIds.has(book.ID as number) || book.ID === selectedBookId}
                  isOnDevice={onDeviceIds.has(book.ID as number)}
                  deviceLetter={letter}
                  devColor={color}
                  onClick={handleClick}
                  onDoubleClick={b => onDoubleClickBook?.(b)}
                  onContextMenu={handleContextMenu}
                />
              )
            })}
          </div>
        ))}
      </div>

      {ctxMenu && ReactDOM.createPortal(
        <div
          id="book-grid-ctx-menu"
          className="bp6-dark"
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
                icon="edit"
                onClick={() => {
                  const book = books.find(b => selectedBookIds.has(b.ID as number)) ?? null
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
                  const book = books.find(b => selectedBookIds.has(b.ID as number)) ?? null
                  if (book) onFetchMetadata?.(book)
                  setCtxMenu(null)
                }}
              />
            )}
            {(() => {
              const selectedBooks = books.filter(b => selectedBookIds.has(b.ID as number))
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
