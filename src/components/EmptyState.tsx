import type { ReactNode } from 'react'

export default function EmptyState({
  title,
  description,
  icon,
}: {
  title: string
  description?: string
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {icon && <div className="mb-3 text-neutral-300">{icon}</div>}
      <p className="font-medium text-neutral-700">{title}</p>
      {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
    </div>
  )
}
