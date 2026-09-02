import type { DepletionResult } from '../lib/calc'

const TONE = {
  outOfStock: 'bg-red-50 text-red-700 ring-red-200',
  soon: 'bg-amber-50 text-amber-800 ring-amber-200',
  collecting: 'bg-neutral-100 text-neutral-500 ring-neutral-200',
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
} as const

export function depletionLabel({ status, daysLeft }: DepletionResult): string {
  switch (status) {
    case 'outOfStock':
      return '재고 없음'
    case 'collecting':
      return '데이터 수집 중'
    case 'soon':
      // A13 — 예상일이 지난 경우와 바로 오늘인 경우를 따로 말한다
      if (daysLeft == null) return '곧 소진'
      if (daysLeft < 0) return `${Math.abs(daysLeft)}일 지남`
      if (daysLeft === 0) return '오늘 소진 예상'
      return `약 ${daysLeft}일 후 소진`
    case 'ok':
      return `약 ${daysLeft}일 후 소진`
  }
}

export default function StatusBadge({ result }: { result: DepletionResult }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[result.status]}`}
    >
      {depletionLabel(result)}
    </span>
  )
}
