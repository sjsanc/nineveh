import { useEffect, useState } from 'react'
import { usePrefs } from './prefsContext'
import { prefs } from '../wailsjs/go/models'
import { BookTable } from './components/BookTable'
import { BookPanel } from './components/BookPanel'
import { DeviceTable } from './components/DeviceTable'
import { DevicePanel } from './components/DevicePanel'
import { EditBookDialog } from './components/EditBookDialog'
import { FetchMetadataDialog } from './components/FetchMetadataDialog'
import { Sidebar } from './components/Sidebar'
import { SubSidebar } from './components/SubSidebar'
import { Book, BookFile, DeviceInfo, FetchedMetadata, metadata } from './types'
import { GetBooks, SelectDirectory, SelectFiles, ImportFile, ImportFromCalibre, ResetLibrary, DetectDevices, ListDeviceBooks, SendBook, UpdateBook, DeleteBook, RemoveFromDevice, FetchBookMetadata } from '../wailsjs/go/main/App'
import { EventsOn } from '../wailsjs/runtime/runtime'
import { ErrorBoundary } from './components/ErrorBoundary'

const KINDLE_FORMAT_PRIORITY = ['azw3', 'mobi', 'azw', 'epub', 'pdf']

function App() {
  const { prefs: appPrefs, updatePrefs } = usePrefs()
  const [books, setBooks] = useState<Book[]>([])
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [selectedBookIds, setSelectedBookIds] = useState<Set<number>>(new Set())
  const [editingBook, setEditingBook] = useState<Book | null>(null)
  const [fetchingBook, setFetchingBook] = useState<Book | null>(null)
  const [metadataCandidates, setMetadataCandidates] = useState<FetchedMetadata[] | null>(null)
  const [fetchError, setFetchError] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [activeDeviceID, setActiveDeviceID] = useState<string | null>(null)
  const [deviceLetterMap, setDeviceLetterMap] = useState<Map<string, string>>(new Map())
  const [deviceBooks, setDeviceBooks] = useState<BookFile[]>([])
  const [activeSection, setActiveSection] = useState<'library' | 'devices'>('library')
  const [selectedDeviceFile, setSelectedDeviceFile] = useState<BookFile | null>(null)
  const [isLoadingDeviceBooks, setIsLoadingDeviceBooks] = useState(false)

  function assignLetters(found: DeviceInfo[]) {
    setDeviceLetterMap(prev => {
      const next = new Map(prev)
      for (const d of found) {
        if (!next.has(d.ID) && next.size < 26) {
          next.set(d.ID, String.fromCharCode(65 + next.size))
        }
      }
      return next
    })
  }

  function showStatus(msg: string, ms = 3000) {
    setImportStatus(msg)
    setTimeout(() => setImportStatus(''), ms)
  }

  useEffect(() => {
    GetBooks().then(result => {
      const loaded = result ?? []
      setBooks(loaded)
      if (loaded.length > 0) setSelectedBook(loaded[0])
    }).catch(console.error)

    DetectDevices().then(result => {
      const found = result ?? []
      setDevices(found)
      assignLetters(found)
      if (found.length > 0) {
        setActiveDeviceID(found[0].ID)
        setIsLoadingDeviceBooks(true)
        ListDeviceBooks(found[0].ID).then(files => setDeviceBooks(files ?? [])).catch(console.error).finally(() => setIsLoadingDeviceBooks(false))
      }
    }).catch(console.error)
  }, [])

  useEffect(() => {
    const unsubscribe = EventsOn("devices:changed", (found: DeviceInfo[]) => {
      const list = found ?? []
      setDevices(list)
      assignLetters(list)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (devices.length === 0) {
      setActiveSection('library')
      setActiveDeviceID(null)
      setDeviceBooks([])
      setSelectedDeviceFile(null)
      return
    }
    if (activeDeviceID && !devices.some(d => d.ID === activeDeviceID)) {
      setActiveDeviceID(null)
      setDeviceBooks([])
    }
  }, [devices])

  async function handleSelectDevice(id: string) {
    if (isLoadingDeviceBooks) return
    setActiveDeviceID(id)
    setSelectedDeviceFile(null)
    setIsLoadingDeviceBooks(true)
    try {
      const files = await ListDeviceBooks(id)
      setDeviceBooks(files ?? [])
    } catch (err) {
      setDeviceBooks([])
      console.error(err)
    } finally {
      setIsLoadingDeviceBooks(false)
    }
  }

  function handleSelectLibrary() {
    setActiveSection('library')
    setActiveDeviceID(null)
    setSelectedDeviceFile(null)
  }

  async function handleSelectDevices() {
    setActiveSection('devices')
    setSelectedDeviceFile(null)
    const targetId = activeDeviceID ?? devices[0]?.ID
    if (targetId) await handleSelectDevice(targetId)
  }

  async function handleRescanDevices() {
    try {
      const result = await DetectDevices()
      const found = result ?? []
      setDevices(found)
      assignLetters(found)
      if (found.length > 0) {
        setActiveDeviceID(found[0].ID)
        setIsLoadingDeviceBooks(true)
        ListDeviceBooks(found[0].ID).then(files => setDeviceBooks(files ?? [])).catch(console.error).finally(() => setIsLoadingDeviceBooks(false))
      } else {
        setDeviceBooks([])
      }
      if (activeDeviceID && !found.some(d => d.ID === activeDeviceID)) {
        setActiveDeviceID(null)
      }
    } catch (err) {
      console.error(err)
    }
  }

  function handleSelectionChange(ids: Set<number>, focused: Book | null) {
    setSelectedBookIds(ids)
    if (focused) setSelectedBook(focused)
  }

  async function handleSendToDevice(bookIds: number[], deviceId: string) {
    const total = bookIds.length
    setImportStatus(`Sending ${total} book${total === 1 ? '' : 's'}…`)
    let sent = 0
    let skipped = 0
    for (const id of bookIds) {
      const book = books.find(b => b.ID === id)
      if (!book) { skipped++; continue }
      const bestFormat = KINDLE_FORMAT_PRIORITY.find(fmt =>
        book.Formats?.some(f => f.Format === fmt)
      )
      if (!bestFormat) { skipped++; continue }
      try {
        await SendBook(id, deviceId, bestFormat as any)
        sent++
      } catch (err) {
        console.error(`SendBook failed for ${id}:`, err)
        skipped++
      }
    }
    const msg = skipped > 0
      ? `Sent ${sent}/${total} (${skipped} skipped — no compatible format)`
      : `Sent ${sent} book${sent === 1 ? '' : 's'}`
    showStatus(msg, 4000)
  }

  function handleSaveBook(updated: Book) {
    setBooks(prev => prev.map(b => b.ID === updated.ID ? updated : b))
    if (selectedBook?.ID === updated.ID) setSelectedBook(updated)
  }

  async function handleFetchMetadata(book: Book) {
    setFetchingBook(book)
    setMetadataCandidates(null)
    setFetchError('')
    try {
      const candidates = await FetchBookMetadata(book.ID as number)
      setMetadataCandidates(candidates ?? [])
    } catch (err: any) {
      setFetchError(String(err))
      setMetadataCandidates([])
    }
  }

  async function handleToggleRead(bookIds: number[], isRead: boolean) {
    const targets = books.filter(b => bookIds.includes(b.ID as number))
    await Promise.all(targets.map(b => UpdateBook(new metadata.Book({ ...b, IsRead: isRead }))))
    const updated = (b: Book) => new metadata.Book({ ...b, IsRead: isRead })
    setBooks(prev => prev.map(b => bookIds.includes(b.ID as number) ? updated(b) : b))
    if (selectedBook && bookIds.includes(selectedBook.ID as number)) {
      setSelectedBook(prev => prev ? updated(prev) : prev)
    }
  }

  async function handleRemoveBooks(ids: number[]) {
    const results = await Promise.allSettled(ids.map(id => DeleteBook(id)))
    const removed = results.filter(r => r.status === 'fulfilled').length
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`DeleteBook failed for ${ids[i]}:`, r.reason)
    })
    setBooks(prev => prev.filter(b => !ids.includes(b.ID as number)))
    if (selectedBook && ids.includes(selectedBook.ID as number)) {
      setSelectedBook(null)
    }
    setSelectedBookIds(prev => {
      const next = new Set(prev)
      ids.forEach(id => next.delete(id))
      return next
    })
    showStatus(`Removed ${removed} book${removed === 1 ? '' : 's'}`)
  }

  async function handleRemoveFromDevice(paths: string[]) {
    if (!activeDeviceID) return
    try {
      await RemoveFromDevice(activeDeviceID, paths)
      setDeviceBooks(prev => prev.filter(b => !paths.includes(b.Path)))
      showStatus(`Removed ${paths.length} file${paths.length === 1 ? '' : 's'} from device`)
    } catch (err) {
      showStatus('Remove failed')
      console.error(err)
    }
  }

  async function handleAddBooks() {
    try {
      const paths = await SelectFiles()
      if (!paths?.length) return
      setImportStatus(`Adding ${paths.length} book${paths.length === 1 ? '' : 's'}…`)
      const results = await Promise.allSettled(paths.map(path => ImportFile(path)))
      const added: Book[] = []
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) added.push(r.value)
        else if (r.status === 'rejected') console.error('ImportFile failed:', r.reason)
      }
      if (added.length > 0) {
        setBooks(prev => [...prev, ...added])
        showStatus(`Added ${added.length} book${added.length === 1 ? '' : 's'}`)
      } else {
        showStatus('Nothing added')
      }
    } catch (err) {
      showStatus('Add failed')
      console.error(err)
    }
  }

  async function handleImportFromCalibre() {
    try {
      const dir = await SelectDirectory()
      if (!dir) return

      setImportStatus('Importing…')
      const imported = await ImportFromCalibre(dir) ?? []
      if (imported.length > 0) {
        setBooks(prev => [...prev, ...imported])
        showStatus(`Imported ${imported.length} book${imported.length === 1 ? '' : 's'}`)
      } else {
        showStatus('Nothing new found')
      }
    } catch (err) {
      showStatus('Import failed')
      console.error(err)
    }
  }

  async function handleResetLibrary() {
    if (!confirm('Reset library? This clears all books and covers from the database.')) return
    try {
      await ResetLibrary()
      setBooks([])
      setSelectedBook(null)
      showStatus('Library reset')
    } catch (err) {
      showStatus('Reset failed')
      console.error(err)
    }
  }


  const activeDevice = devices.find(d => d.ID === activeDeviceID) ?? null

  return (
    <div className="bp6-dark h-screen w-screen flex bg-zinc-950 text-zinc-100 overflow-hidden">
      <Sidebar
        isLibraryActive={activeSection === 'library'}
        isDevicesActive={activeSection === 'devices'}
        hasDevices={devices.length > 0}
        onSelectLibrary={handleSelectLibrary}
        onSelectDevices={handleSelectDevices}
        onRescan={handleRescanDevices}
      />
      <SubSidebar
        activeSection={activeSection}
        onImport={handleImportFromCalibre}
        onAdd={handleAddBooks}
        onReset={handleResetLibrary}
        importStatus={importStatus}
        devices={devices}
        activeDeviceID={activeDeviceID}
        deviceLetterMap={deviceLetterMap}
        onSelectDevice={handleSelectDevice}
        isLoadingDeviceBooks={isLoadingDeviceBooks}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-hidden flex flex-col">
          <ErrorBoundary key={activeSection}>
          {activeSection === 'devices' ? (
            <div className="flex-1 overflow-hidden flex flex-row">
              <DeviceTable
                data={deviceBooks}
                books={books}
                device={activeDevice ?? undefined}
                isLoading={isLoadingDeviceBooks}
                onRemoveFromDevice={handleRemoveFromDevice}
                onSelectFile={setSelectedDeviceFile}
              />
              {selectedDeviceFile && (
                <DevicePanel
                  key={selectedDeviceFile.Path}
                  file={selectedDeviceFile}
                  books={books}
                  width={appPrefs.detailsPaneWidth || 288}
                  onWidthChange={w => updatePrefs(new prefs.Preferences({ ...appPrefs, detailsPaneWidth: w }))}
                />
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex flex-row">
              <BookTable
                data={books}
                selectedBookId={selectedBook?.ID}
                selectedBookIds={selectedBookIds}
                onSelectBook={setSelectedBook}
                onSelectionChange={handleSelectionChange}
                onDoubleClickBook={setEditingBook}
                devices={devices}
                activeDeviceID={activeDeviceID}
                deviceLetterMap={deviceLetterMap}
                deviceBooks={deviceBooks}
                onSendToDevice={handleSendToDevice}
                onEditBook={setEditingBook}
                onFetchMetadata={handleFetchMetadata}
                onToggleRead={handleToggleRead}
                onRemoveBooks={handleRemoveBooks}
                columnWidths={appPrefs.columns?.widths ?? {}}
                onColumnWidthsChange={widths => updatePrefs(new prefs.Preferences({ ...appPrefs, columns: { ...appPrefs.columns, widths } }))}
              />
              {selectedBook && (
                <BookPanel
                  key={selectedBook.ID}
                  book={selectedBook}
                  width={appPrefs.detailsPaneWidth || 288}
                  onWidthChange={w => updatePrefs(new prefs.Preferences({ ...appPrefs, detailsPaneWidth: w }))}
                />
              )}
            </div>
          )}
          </ErrorBoundary>
        </main>
      </div>
      <ErrorBoundary key={editingBook?.ID ?? 'no-edit'}>
        <EditBookDialog
          book={editingBook}
          onClose={() => setEditingBook(null)}
          onSave={handleSaveBook}
        />
      </ErrorBoundary>
      {fetchingBook && (
        <ErrorBoundary key={fetchingBook.ID}>
          <FetchMetadataDialog
            book={fetchingBook}
            candidates={metadataCandidates}
            error={fetchError}
            onClose={() => { setFetchingBook(null); setMetadataCandidates(null); setFetchError('') }}
            onSave={updated => {
              handleSaveBook(updated)
            }}
          />
        </ErrorBoundary>
      )}
    </div>
  )
}

export default App
