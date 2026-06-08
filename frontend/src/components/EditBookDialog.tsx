import { createPortal } from 'react-dom'
import { Book } from '../types'
import { BookEditForm } from './BookEditForm'

interface Props {
  book: Book | null
  onClose: () => void
  onSave: (updated: Book) => void
}

export function EditBookDialog({ book, onClose, onSave }: Props) {
  if (!book) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-zinc-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-zinc-800"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex justify-between items-center z-10">
          <h2 className="text-lg font-semibold text-zinc-100">Edit Book Metadata</h2>
          <button
            onMouseDown={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <BookEditForm book={book} onClose={onClose} onSave={onSave} />
      </div>
    </div>,
    document.body
  )
}
