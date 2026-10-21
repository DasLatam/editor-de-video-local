import { clsx } from 'clsx'

interface Props {
  label: string
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
}

export function Badge({ label, variant = 'default' }: Props) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      {
        'bg-gray-100 text-gray-700': variant === 'default',
        'bg-green-100 text-green-700': variant === 'success',
        'bg-yellow-100 text-yellow-700': variant === 'warning',
        'bg-red-100 text-red-700': variant === 'error',
        'bg-blue-100 text-blue-700': variant === 'info',
      }
    )}>
      {label}
    </span>
  )
}
