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

export function filterItem(query: string, item: string): boolean {
  return item.toLowerCase().includes(query.toLowerCase())
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

const HTML_TAG_RE = /<\/?[a-z][\s\S]*?>/i
const BULLET_RE = /^\s*(?:[-*•‣◦]|\d+[.)])\s+(.*)$/

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// EPUB/MOBI/AZW3/PDF metadata gives plain text, where any bullet list only
// survives as literal "- "/"•" characters inline in a run-on paragraph.
function plainTextToHtml(text: string): string {
  const blocks: string[] = []
  let listItems: string[] = []
  let paragraph: string[] = []

  function flushList() {
    if (listItems.length) {
      blocks.push(`<ul>${listItems.map(i => `<li>${i}</li>`).join('')}</ul>`)
      listItems = []
    }
  }
  function flushParagraph() {
    if (paragraph.length) {
      blocks.push(`<p>${paragraph.join('<br/>')}</p>`)
      paragraph = []
    }
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      flushList()
      flushParagraph()
      continue
    }
    const m = line.match(BULLET_RE)
    if (m) {
      flushParagraph()
      listItems.push(escapeHtml(m[1]))
    } else {
      flushList()
      paragraph.push(escapeHtml(line))
    }
  }
  flushList()
  flushParagraph()
  return blocks.join('')
}

function isListItem(n: ChildNode): boolean {
  return n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'LI'
}

function isWhitespaceNode(n: ChildNode): boolean {
  return n.nodeType === Node.TEXT_NODE && !(n.textContent ?? '').trim()
}

// Some metadata feeds (Goodreads/Amazon-style descriptions) emit bare <li>
// bullet points with no wrapping <ul>/<ol>. Browsers render those with no
// hanging indentation, so group consecutive orphan <li> siblings into a
// synthesized <ul> that the prose styling can actually indent.
function wrapOrphanListItems(root: ParentNode) {
  const parents = new Set<Element>()
  root.querySelectorAll('li').forEach(li => {
    const parent = li.parentElement
    if (parent && parent.tagName !== 'UL' && parent.tagName !== 'OL') parents.add(parent)
  })

  parents.forEach(parent => {
    const nodes = Array.from(parent.childNodes)
    let i = 0
    while (i < nodes.length) {
      if (!isListItem(nodes[i])) { i++; continue }
      const run: ChildNode[] = []
      let j = i
      while (j < nodes.length && (isListItem(nodes[j]) || isWhitespaceNode(nodes[j]))) {
        run.push(nodes[j])
        j++
      }
      const insertBefore = nodes[j] ?? null
      const ul = document.createElement('ul')
      run.filter(isListItem).forEach(n => ul.appendChild(n))
      parent.insertBefore(ul, insertBefore)
      i = j
    }
  })
}

export function formatDescription(text: string): string {
  if (!text) return ''
  const html = HTML_TAG_RE.test(text) ? text : plainTextToHtml(text)
  const container = document.createElement('div')
  container.innerHTML = html
  wrapOrphanListItems(container)
  return container.innerHTML
}
