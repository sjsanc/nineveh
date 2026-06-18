import ReactDOM from 'react-dom'
import { Menu, MenuItem, MenuDivider } from '@blueprintjs/core'
import { Book, DeviceInfo } from '../types'

interface Props {
  menuId: string
  pos: { x: number; y: number } | null
  selectedBookIds: Set<number>
  focusedBook: Book | null
  visibleBooks: Book[]
  devices: DeviceInfo[]
  onClose: () => void
  onOpenBook?: (bookId: number, format: string) => void
  onEditBook?: (book: Book) => void
  onFetchMetadata?: (book: Book) => void
  onToggleRead?: (bookIds: number[], isRead: boolean) => void
  onSendToDevice?: (bookIds: number[], deviceId: string) => void
  onRemoveBooks?: (ids: number[]) => void
}

export function BookContextMenu({
  menuId,
  pos,
  selectedBookIds,
  focusedBook,
  visibleBooks,
  devices,
  onClose,
  onOpenBook,
  onEditBook,
  onFetchMetadata,
  onToggleRead,
  onSendToDevice,
  onRemoveBooks,
}: Props) {
  if (!pos) return null

  const selectionCount = selectedBookIds.size
  const formats = focusedBook?.Formats ?? []
  const selectedBooks = visibleBooks.filter(b => selectedBookIds.has(b.ID as number))
  const allRead = selectedBooks.length > 0 && selectedBooks.every(b => b.IsRead)
  const readLabel = allRead
    ? (selectionCount > 1 ? 'Mark All as Unread' : 'Mark as Unread')
    : (selectionCount > 1 ? 'Mark All as Read' : 'Mark as Read')

  return ReactDOM.createPortal(
    <div
      id={menuId}
      className="bp6-dark"
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 1000 }}
    >
      <Menu>
        <MenuItem disabled text={`${selectionCount} book${selectionCount === 1 ? '' : 's'} selected`} />
        <MenuDivider />
        {selectionCount === 1 && formats.length > 0 && (
          formats.length === 1 ? (
            <MenuItem
              text={`Open (${formats[0].Format.toUpperCase()})`}
              icon="document-open"
              onClick={() => { onOpenBook?.(focusedBook!.ID as number, formats[0].Format); onClose() }}
            />
          ) : (
            <MenuItem text="Open" icon="document-open">
              {formats.map(f => (
                <MenuItem
                  key={f.Format}
                  text={f.Format.toUpperCase()}
                  onClick={() => { onOpenBook?.(focusedBook!.ID as number, f.Format); onClose() }}
                />
              ))}
            </MenuItem>
          )
        )}
        <MenuDivider />
        {selectionCount === 1 && (
          <MenuItem
            text="Edit Metadata"
            icon="edit"
            onClick={() => { if (focusedBook) onEditBook?.(focusedBook); onClose() }}
          />
        )}
        {selectionCount === 1 && (
          <MenuItem
            text="Fetch Metadata"
            icon="cloud-download"
            onClick={() => { if (focusedBook) onFetchMetadata?.(focusedBook); onClose() }}
          />
        )}
        <MenuItem
          text={readLabel}
          icon={allRead ? 'cross' : 'tick'}
          onClick={() => { onToggleRead?.([...selectedBookIds] as number[], !allRead); onClose() }}
        />
        {devices.length === 0 ? (
          <MenuItem text="Send to Device" icon="upload" disabled />
        ) : devices.length === 1 ? (
          <MenuItem
            text={`Send to "${devices[0].Name}"`}
            icon="upload"
            onClick={() => { onSendToDevice?.([...selectedBookIds] as number[], devices[0].ID); onClose() }}
          />
        ) : (
          <MenuItem text="Send to Device" icon="upload">
            {devices.map(d => (
              <MenuItem
                key={d.ID}
                text={d.Name}
                icon="desktop"
                onClick={() => { onSendToDevice?.([...selectedBookIds] as number[], d.ID); onClose() }}
              />
            ))}
          </MenuItem>
        )}
        <MenuDivider />
        <MenuItem
          text={`Remove ${selectionCount} book${selectionCount === 1 ? '' : 's'} from library`}
          icon="trash"
          intent="danger"
          onClick={() => { onRemoveBooks?.([...selectedBookIds] as number[]); onClose() }}
        />
      </Menu>
    </div>,
    document.body
  )
}
