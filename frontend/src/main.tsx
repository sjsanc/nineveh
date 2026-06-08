import React from 'react'
import { createRoot } from 'react-dom/client'
import '@blueprintjs/core/lib/css/blueprint.css'
import './style.css'
import App from './App'
import { PrefsProvider } from './prefsContext'

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <PrefsProvider>
            <App />
        </PrefsProvider>
    </React.StrictMode>
)
