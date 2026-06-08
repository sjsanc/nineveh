import { DeviceInfo } from '../types'
import { deviceColor } from '../utils'

interface Props {
  devices: DeviceInfo[]
  activeDeviceID: string | null
  deviceLetterMap: Map<string, string>
  onSelectDevice: (id: string) => void
  onClose: () => void
}

export function DevicesPanel({ devices, activeDeviceID, deviceLetterMap, onSelectDevice, onClose }: Props) {
  return (
    <>
      <div className="absolute inset-0 z-10" onClick={onClose} />
      <div className="absolute left-0 top-0 bottom-0 w-64 z-20 bg-zinc-900 border-r border-zinc-800 flex flex-col shadow-xl">
        <div className="px-4 py-3 border-b border-zinc-800 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Devices</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-2">
            {devices.map(d => {
              const letter = deviceLetterMap.get(d.ID) ?? '?'
              return (
                <button
                  key={d.ID}
                  onClick={() => { onSelectDevice(d.ID); onClose() }}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg border transition-colors w-full ${
                    activeDeviceID === d.ID
                      ? 'bg-zinc-700 border-zinc-600 text-zinc-100'
                      : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600 text-zinc-300'
                  }`}
                >
                  <div
                    className="w-9 h-9 flex items-center justify-center rounded font-bold text-lg text-zinc-900 shrink-0"
                    style={{ backgroundColor: deviceColor(letter) }}
                  >
                    {letter}
                  </div>
                  <div className="flex flex-col text-left min-w-0 flex-1">
                    <span className="text-sm font-medium leading-tight truncate">{d.Name}</span>
                    <span className="text-[10px] text-zinc-500">Device Memory</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
