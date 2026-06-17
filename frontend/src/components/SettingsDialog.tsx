import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Switch, InputGroup, Callout } from '@blueprintjs/core'
import { prefs } from '../../wailsjs/go/models'
import { usePrefs } from '../prefsContext'

interface Props {
  onClose: () => void
}

export function SettingsDialog({ onClose }: Props) {
  const { prefs: appPrefs, updatePrefs } = usePrefs()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  function setFetchSources(patch: Partial<prefs.FetchSourcePrefs>) {
    updatePrefs(new prefs.Preferences({
      ...appPrefs,
      fetchSources: new prefs.FetchSourcePrefs({
        ...appPrefs.fetchSources,
        ...patch,
      }),
    }))
  }

  function setAPIKey(key: string) {
    updatePrefs(new prefs.Preferences({ ...appPrefs, googleBooksApiKey: key }))
  }

  const { openLibraryEnabled, googleBooksEnabled } = appPrefs.fetchSources ?? { openLibraryEnabled: true, googleBooksEnabled: true }
  const apiKey = appPrefs.googleBooksApiKey ?? ''
  const googleBooksActive = googleBooksEnabled && apiKey !== ''

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-zinc-900 rounded-lg shadow-xl w-full max-w-lg border border-zinc-800 flex flex-col"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-zinc-100">Settings</h2>
          <button
            onMouseDown={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Metadata Sources</h3>

            {/* Open Library */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-200">Open Library</p>
              </div>
              <Switch
                checked={openLibraryEnabled}
                onChange={e => setFetchSources({ openLibraryEnabled: (e.target as HTMLInputElement).checked })}
                className="mb-0"
              />
            </div>

            {/* Google Books */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-200">Google Books</p>
                </div>
                <Switch
                  checked={googleBooksEnabled}
                  onChange={e => setFetchSources({ googleBooksEnabled: (e.target as HTMLInputElement).checked })}
                  className="mb-0"
                />
              </div>

              {googleBooksEnabled && (
                <div className="space-y-2">
                  <InputGroup
                    placeholder="Google Books API key"
                    value={apiKey}
                    onChange={e => setAPIKey((e.target as HTMLInputElement).value)}
                    type="password"
                    fill
                  />
                  {googleBooksEnabled && !apiKey && (
                    <Callout intent="warning" className="text-xs">
                      An API key is required to use Google Books.
                    </Callout>
                  )}
                  {googleBooksActive && (
                    <p className="text-xs text-green-500">Google Books is active.</p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-6 py-4 flex justify-end">
          <button
            onMouseDown={onClose}
            className="px-4 py-2 text-sm text-zinc-300 hover:text-zinc-100 rounded border border-zinc-700 hover:border-zinc-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
