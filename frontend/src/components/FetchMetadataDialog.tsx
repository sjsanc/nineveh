import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Spinner, NonIdealState, Callout, HTMLSelect } from '@blueprintjs/core'
import { Book, FetchedMetadata, metadata } from '../types'
import { UpdateBook, ApplyFetchedCover } from '../../wailsjs/go/main/App'

interface Props {
  book: Book
  candidates: FetchedMetadata[] | null  // null = still loading
  error?: string
  onClose: () => void
  onSave: (updated: Book) => void
}

type FieldKey = 'Title' | 'Authors' | 'Publisher' | 'Series' | 'SeriesIndex' | 'Language' | 'Description' | 'Tags' | 'Rating' | 'DatePublished' | 'ISBN' | 'Cover'

const FIELD_LABELS: { key: FieldKey; label: string }[] = [
  { key: 'Title', label: 'Title' },
  { key: 'Authors', label: 'Authors' },
  { key: 'Publisher', label: 'Publisher' },
  { key: 'Series', label: 'Series' },
  { key: 'SeriesIndex', label: 'Series Index' },
  { key: 'Language', label: 'Language' },
  { key: 'Description', label: 'Description' },
  { key: 'Tags', label: 'Tags' },
  { key: 'Rating', label: 'Rating' },
  { key: 'DatePublished', label: 'Published' },
  { key: 'ISBN', label: 'ISBN' },
  { key: 'Cover', label: 'Cover' },
]

function displayValue(book: Book, key: FieldKey): string {
  switch (key) {
    case 'Authors': return book.Authors?.join(', ') ?? ''
    case 'Tags': return book.Tags?.join(', ') ?? ''
    case 'SeriesIndex': return book.SeriesIndex ? String(book.SeriesIndex) : ''
    case 'Rating': return book.Rating ? String(book.Rating) : ''
    case 'DatePublished': return book.DatePublished ? book.DatePublished.slice(0, 10) : ''
    case 'Cover': return book.CoverPath ? '(has cover)' : ''
    default: return (book as any)[key] ?? ''
  }
}

function candidateValue(c: FetchedMetadata, key: FieldKey): string {
  switch (key) {
    case 'Authors': return c.Authors?.join(', ') ?? ''
    case 'Tags': return c.Tags?.join(', ') ?? ''
    case 'SeriesIndex': return c.SeriesIndex ? String(c.SeriesIndex) : ''
    case 'Rating': return c.Rating ? String(c.Rating) : ''
    case 'DatePublished': return c.DatePublished ? c.DatePublished.slice(0, 10) : ''
    case 'Cover': return c.CoverURL ? '(fetch cover)' : ''
    default: return (c as any)[key] ?? ''
  }
}

function initialAcceptedFields(book: Book, candidate: FetchedMetadata): Set<FieldKey> {
  const accepted = new Set<FieldKey>()
  for (const { key } of FIELD_LABELS) {
    const current = displayValue(book, key)
    const fetched = candidateValue(candidate, key)
    if (fetched && fetched !== current) {
      accepted.add(key)
    }
  }
  return accepted
}

export function FetchMetadataDialog({ book, candidates, error, onClose, onSave }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [acceptedFields, setAcceptedFields] = useState<Set<FieldKey>>(() => {
    if (candidates && candidates.length > 0) {
      return initialAcceptedFields(book, candidates[0])
    }
    return new Set()
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const candidate = candidates?.[selectedIdx] ?? null

  function handleCandidateChange(idx: number) {
    setSelectedIdx(idx)
    if (candidates && candidates[idx]) {
      setAcceptedFields(initialAcceptedFields(book, candidates[idx]))
    }
  }

  function toggleField(key: FieldKey) {
    setAcceptedFields(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleApply() {
    if (!candidate) return
    setSaving(true)
    setSaveError('')
    try {
      let coverPath = book.CoverPath

      if (acceptedFields.has('Cover') && candidate.CoverURL) {
        coverPath = await ApplyFetchedCover(book.ID as number, candidate.CoverURL)
      }

      const merged = new metadata.Book({
        ...book,
        Title: acceptedFields.has('Title') ? candidate.Title || book.Title : book.Title,
        Authors: acceptedFields.has('Authors') && candidate.Authors?.length ? candidate.Authors : book.Authors,
        Publisher: acceptedFields.has('Publisher') ? candidate.Publisher || book.Publisher : book.Publisher,
        Series: acceptedFields.has('Series') ? candidate.Series || book.Series : book.Series,
        SeriesIndex: acceptedFields.has('SeriesIndex') && candidate.SeriesIndex ? candidate.SeriesIndex : book.SeriesIndex,
        Language: acceptedFields.has('Language') ? candidate.Language || book.Language : book.Language,
        Description: acceptedFields.has('Description') ? candidate.Description || book.Description : book.Description,
        Tags: acceptedFields.has('Tags') && candidate.Tags?.length ? candidate.Tags : book.Tags,
        Rating: acceptedFields.has('Rating') && candidate.Rating ? candidate.Rating : book.Rating,
        DatePublished: acceptedFields.has('DatePublished') ? candidate.DatePublished || book.DatePublished : book.DatePublished,
        ISBN: acceptedFields.has('ISBN') ? candidate.ISBN || book.ISBN : book.ISBN,
        CoverPath: coverPath,
      })

      await UpdateBook(merged)
      onSave(merged)
      onClose()
    } catch (err: any) {
      setSaveError(String(err))
      setSaving(false)
    }
  }

  const acceptedCount = acceptedFields.size

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-zinc-900 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-zinc-800"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex justify-between items-center z-10">
          <h2 className="text-lg font-semibold text-zinc-100">Fetch Metadata</h2>
          <button
            onMouseDown={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {/* Loading state */}
          {candidates === null && !error && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Spinner size={40} />
              <p className="text-zinc-400 text-sm">Searching metadata sources…</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <Callout intent="danger" title="Fetch failed">
              {error}
            </Callout>
          )}

          {/* No results */}
          {candidates !== null && !error && candidates.length === 0 && (
            <NonIdealState
              icon="search"
              title="No results found"
              description="No metadata candidates were found for this book. Try editing the title or ISBN and searching again."
            />
          )}

          {/* Results */}
          {candidate && (
            <>
              {/* Candidate selector */}
              {candidates!.length > 1 && (
                <div className="flex items-center gap-3">
                  <span className="text-zinc-400 text-sm">Source:</span>
                  <HTMLSelect
                    className="bp5-dark"
                    value={selectedIdx}
                    onChange={e => handleCandidateChange(Number(e.target.value))}
                  >
                    {candidates!.map((c, i) => (
                      <option key={i} value={i}>{c.Source} ({i + 1}/{candidates!.length})</option>
                    ))}
                  </HTMLSelect>
                </div>
              )}

              {candidates!.length === 1 && (
                <p className="text-zinc-400 text-sm">Source: {candidate.Source}</p>
              )}

              {saveError && (
                <Callout intent="danger" title="Save failed">{saveError}</Callout>
              )}

              {/* Comparison table */}
              <div className="rounded-md border border-zinc-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-800 text-zinc-400 text-left">
                      <th className="px-3 py-2 w-28">Field</th>
                      <th className="px-3 py-2">Current</th>
                      <th className="px-3 py-2">Fetched</th>
                      <th className="px-3 py-2 w-10 text-center">Use</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FIELD_LABELS.map(({ key, label }) => {
                      const currentVal = displayValue(book, key)
                      const fetchedVal = candidateValue(candidate, key)
                      const differs = fetchedVal !== '' && fetchedVal !== currentVal
                      const isCoverRow = key === 'Cover'

                      return (
                        <tr
                          key={key}
                          className={`border-t border-zinc-800 ${differs && acceptedFields.has(key) ? 'bg-blue-500/10' : ''}`}
                        >
                          <td className="px-3 py-2 text-zinc-400 font-medium whitespace-nowrap">{label}</td>
                          <td className="px-3 py-2 text-zinc-300 max-w-xs">
                            {isCoverRow && book.CoverPath ? (
                              <img
                                src={`/covers/${book.CoverPath.replace('/covers/', '')}`}
                                className="h-16 w-auto object-contain rounded"
                                alt="current cover"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                              />
                            ) : (
                              <span className={currentVal ? '' : 'text-zinc-600 italic'}>
                                {currentVal || 'empty'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-zinc-200 max-w-xs">
                            {isCoverRow && candidate.CoverURL ? (
                              <img
                                src={candidate.CoverURL}
                                className="h-16 w-auto object-contain rounded"
                                alt="fetched cover"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                              />
                            ) : (
                              <span className={fetchedVal ? (differs ? 'text-blue-300' : '') : 'text-zinc-600 italic'}>
                                {fetchedVal || 'empty'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={acceptedFields.has(key)}
                              disabled={!differs}
                              onChange={() => toggleField(key)}
                              className="accent-blue-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {candidate && (
          <div className="border-t border-zinc-800 px-6 py-4 flex justify-end gap-3">
            <button
              onMouseDown={onClose}
              className="px-4 py-2 text-sm text-zinc-300 hover:text-zinc-100 rounded border border-zinc-700 hover:border-zinc-500 transition-colors"
            >
              Cancel
            </button>
            <button
              onMouseDown={handleApply}
              disabled={saving || acceptedCount === 0}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              {saving ? 'Applying…' : `Apply ${acceptedCount} field${acceptedCount === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
