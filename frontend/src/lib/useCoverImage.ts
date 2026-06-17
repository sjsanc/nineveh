import { useEffect, useState } from 'react'

const coverCache = new Map<string, string>()

let inFlight = 0
const MAX_CONCURRENT = 6
const queue: Array<() => void> = []

function drainQueue() {
  while (queue.length > 0 && inFlight < MAX_CONCURRENT) {
    inFlight++
    queue.shift()!()
  }
}

function limited<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    queue.push(() => {
      fn().then(resolve, reject).finally(() => {
        inFlight--
        drainQueue()
      })
    })
    drainQueue()
  })
}

export function useCoverImage(path: string | undefined, fetcher: (path: string) => Promise<string>) {
  const [src, setSrc] = useState(() => (path && coverCache.get(path)) || '')

  useEffect(() => {
    if (!path) { setSrc(''); return }

    const cached = coverCache.get(path)
    if (cached) { setSrc(cached); return }

    setSrc('')
    let cancelled = false
    const timer = setTimeout(() => {
      limited(() => fetcher(path)).then(result => {
        coverCache.set(path, result)
        if (!cancelled) setSrc(result)
      }).catch(() => { if (!cancelled) setSrc('') })
    }, 80)

    return () => { clearTimeout(timer); cancelled = true }
  }, [path, fetcher])

  return src
}
