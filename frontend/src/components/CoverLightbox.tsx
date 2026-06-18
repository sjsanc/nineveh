import { useEffect } from 'react'
import ReactDOM from 'react-dom'

interface Props {
  src: string
  alt: string
  onClose: () => void
}

export function CoverLightbox({ src, alt, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className="h-[80vh] max-w-[80vw] w-auto object-contain rounded shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  )
}
