import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { GetPreferences, SavePreferences } from '../wailsjs/go/main/App'
import { prefs } from '../wailsjs/go/models'

const defaults: prefs.Preferences = new prefs.Preferences({
  libraryRoot: '',
  detailsPaneWidth: 288,
  columns: { visible: [], widths: {} },
})

interface PrefsContextValue {
  prefs: prefs.Preferences
  updatePrefs: (p: prefs.Preferences) => void
}

const PrefsContext = createContext<PrefsContextValue>({
  prefs: defaults,
  updatePrefs: () => {},
})

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<prefs.Preferences>(defaults)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    GetPreferences()
      .then(p => { if (p) setState(p) })
      .catch(console.error)
  }, [])

  function updatePrefs(p: prefs.Preferences) {
    setState(p)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      SavePreferences(p).catch(console.error)
    }, 500)
  }

  return (
    <PrefsContext.Provider value={{ prefs: state, updatePrefs }}>
      {children}
    </PrefsContext.Provider>
  )
}

export function usePrefs() {
  return useContext(PrefsContext)
}
