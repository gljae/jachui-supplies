export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-neutral-200 ${className}`} />
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="mt-2 h-4 w-40" />
      <Skeleton className="mt-3 h-4 w-20" />
    </div>
  )
}
