import { Table } from '@tanstack/react-table'
import { Virtualizer } from '@tanstack/react-virtual'

export function makeColWidth<T>(table: Table<T>, containerWidth: number) {
  const total = table.getTotalSize()
  return (size: number) => (containerWidth > 0 && total > 0 ? (size / total) * containerWidth : size)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function virtualPadding(virtualizer: Virtualizer<any, any>) {
  const items = virtualizer.getVirtualItems()
  const total = virtualizer.getTotalSize()
  return {
    items,
    paddingTop: items[0]?.start ?? 0,
    paddingBottom: total - (items.at(-1)?.end ?? 0),
  }
}
