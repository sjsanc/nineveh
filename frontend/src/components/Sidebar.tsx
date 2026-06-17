import { Icon } from '@blueprintjs/core'

interface Props {
  isLibraryActive: boolean
  isDevicesActive: boolean
  hasDevices: boolean
  onSelectLibrary: () => void
  onSelectDevices: () => void
  onRescan: () => void
  onSettingsOpen: () => void
}

export function Sidebar({ isLibraryActive, isDevicesActive, hasDevices, onSelectLibrary, onSelectDevices, onRescan, onSettingsOpen }: Props) {
  return (
    <div className="w-12 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-2 gap-2">
      <button
        onClick={onSelectLibrary}
        title="Library"
        className={`w-9 h-9 flex items-center justify-center rounded transition-colors ${
          isLibraryActive
            ? 'bg-zinc-700 text-zinc-100'
            : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
        }`}
      >
        <Icon icon="book" size={18} />
      </button>
      <button
        onClick={onSelectDevices}
        disabled={!hasDevices}
        title={hasDevices ? 'Devices' : 'No devices connected'}
        className={`w-9 h-9 flex items-center justify-center rounded transition-colors ${
          !hasDevices
            ? 'text-zinc-700 cursor-not-allowed'
            : isDevicesActive
            ? 'bg-zinc-700 text-zinc-100'
            : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
        }`}
      >
        <Icon icon="desktop" size={18} />
      </button>
      <div className="flex-1" />
      <button
        onClick={onRescan}
        title="Rescan for devices"
        className="w-9 h-9 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
      >
        <Icon icon="refresh" size={16} />
      </button>
      <button
        onClick={onSettingsOpen}
        title="Settings"
        className="w-9 h-9 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
      >
        <Icon icon="cog" size={16} />
      </button>
    </div>
  )
}
