import { Book } from './types'

export const DEVICE_COLORS = [
  '#38bdf8', // A
  '#34d399', // B
  '#f87171', // C
  '#fbbf24', // D
  '#a78bfa', // E
  '#22d3ee', // F
  '#a3e635', // G
  '#f472b6', // H
  '#fb923c', // I
  '#2dd4bf', // J
  '#818cf8', // K
  '#4ade80', // L
  '#facc15', // M
  '#e879f9', // N
  '#60a5fa', // O
  '#f9a8d4', // P
  '#86efac', // Q
  '#fcd34d', // R
  '#c4b5fd', // S
  '#67e8f9', // T
  '#bef264', // U
  '#fdba74', // V
  '#5eead4', // W
  '#a5b4fc', // X
  '#6ee7b7', // Y
  '#fca5a5', // Z
]

export function deviceColor(letter: string): string {
  const idx = letter.toUpperCase().charCodeAt(0) - 65
  return DEVICE_COLORS[idx] ?? '#71717a'
}

export const FORMAT_COLORS: Record<string, string> = {
  epub: 'bg-emerald-700',
  pdf: 'bg-blue-700',
  mobi: 'bg-orange-600',
  azw3: 'bg-purple-700',
}

export function formatDate(iso: string) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function stemOf(path: string): string {
  const base = path.split('/').pop() ?? path
  const dot = base.lastIndexOf('.')
  return (dot > 0 ? base.slice(0, dot) : base).toLowerCase()
}

export function buildIndex(books: Book[]): Map<string, Book> {
  const map = new Map<string, Book>()
  for (const book of books) {
    for (const f of book.Formats ?? []) {
      map.set(stemOf(f.Path), book)
    }
    map.set(book.Title.toLowerCase().trim(), book)
  }
  return map
}

export function matchBook(devicePath: string, index: Map<string, Book>): Book | undefined {
  const stem = stemOf(devicePath)
  if (index.has(stem)) return index.get(stem)
  const titlePart = stem.split(' - ')[0].trim()
  if (titlePart && index.has(titlePart)) return index.get(titlePart)
  return undefined
}
