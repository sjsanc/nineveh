import { useEffect, useState } from 'react'

// Fetches a cover image (base64 data URL) for the given path, clearing the
// previous cover immediately so stale art never flashes for a new item.
export function useCoverImage(path: string | undefined, fetcher: (path: string) => Promise<string>) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    setSrc('')
    if (!path) return
    fetcher(path).then(setSrc).catch(() => setSrc(''))
  }, [path, fetcher])

  return src
}
