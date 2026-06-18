import { useState } from 'react'

interface Props {
  value: number
  onChange?: (value: number) => void
  max?: number
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
}

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'text-xs',
  md: 'text-xl',
}

export function Rating({ value, onChange, max = 5, size = 'md', className = '', 'aria-label': ariaLabel }: Props) {
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const readOnly = !onChange
  const displayValue = hoverValue ?? value
  const stars = Array.from({ length: max }, (_, i) => i + 1)

  function commit(star: number) {
    onChange?.(star === value ? 0 : star)
  }

  return (
    <div
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={ariaLabel ?? `Rating: ${value} out of ${max}`}
      className={`inline-flex items-center gap-0.5 ${SIZE_CLASSES[size]} ${readOnly ? '' : 'cursor-pointer'} ${className}`}
      onMouseLeave={readOnly ? undefined : () => setHoverValue(null)}
    >
      {stars.map((star) => {
        const filled = star <= displayValue
        return (
          <span
            key={star}
            role={readOnly ? undefined : 'radio'}
            aria-checked={readOnly ? undefined : star <= value}
            aria-label={readOnly ? undefined : `${star} star${star === 1 ? '' : 's'}`}
            tabIndex={readOnly ? undefined : 0}
            onMouseEnter={readOnly ? undefined : () => setHoverValue(star)}
            onClick={readOnly ? undefined : () => commit(star)}
            onKeyDown={readOnly ? undefined : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                commit(star)
              }
            }}
            className={`leading-none select-none ${filled ? 'text-amber-400' : 'text-zinc-600'} ${
              readOnly ? '' : 'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-sm'
            }`}
          >
            {filled ? '★' : '☆'}
          </span>
        )
      })}
    </div>
  )
}
