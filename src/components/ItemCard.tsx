import { Link } from 'react-router-dom'
import type { CardStats } from '../lib/cardStats'
import { formatDate, formatDays, formatKRW } from '../lib/format'
import type { Item, Purchase } from '../types'
import StatusBadge from './StatusBadge'


export default function ItemCard({
  item,
  purchases,
  stats,
}: {
  item: Item
  purchases: Purchase[]
  stats: CardStats
}) {
  // A10 — 일회성은 재고·주기·소진일이 없다. 언제 얼마에 샀는지만 보여준다.
  const oneTime = item.type === 'oneTime'

  return (
    <li>
      <Link
        to={`/item/${item.id}`}
        className="block rounded-xl border border-neutral-200 bg-white p-4 transition active:bg-neutral-50"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-neutral-900">{item.name}</p>
            <span className="mt-1 inline-block rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
              {item.category}
            </span>
          </div>
          {!oneTime && <StatusBadge result={stats.depletion} />}
        </div>

        <dl className="tabular mt-3 space-y-1 text-sm">
          {oneTime ? (
            <>
              <Row label="구매일" value={stats.latest ? formatDate(stats.latest.purchaseDate) : '—'} />
              <Row label="누적 지출" value={formatKRW(stats.spent)} />
            </>
          ) : (
            <>
              <Row
                label="남은 개수"
                value={
                  stats.remaining.length > 0
                    ? stats.remaining.map((r) => `${r.count}${r.label}`).join(' / ')
                    : '없음'
                }
              />
              <Row
                label="평균 주기"
                value={stats.avgDays != null ? `1개당 ${formatDays(stats.avgDays)}` : '수집 중'}
              />
              <Row
                label="최근 구매가"
                value={stats.latest ? formatKRW(stats.latest.price) : '—'}
              />
            </>
          )}
        </dl>

        <p className="mt-2 text-xs text-neutral-400">이력 {purchases.length}건</p>
      </Link>
    </li>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="truncate text-right text-neutral-800">{value}</dd>
    </div>
  )
}
