import { Package, Plus, Search, SearchX, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import ItemCard from '../components/ItemCard'
import { cardStats } from '../lib/cardStats'
import ItemForm from '../components/ItemForm'
import Sheet from '../components/Sheet'
import { CardSkeleton } from '../components/Skeleton'
import {
  applyFilters,
  EMPTY_FILTERS,
  filtersFromParams,
  hasActiveFilter,
  paramsFromState,
  SORT_LABELS,
  sortFromParams,
  sortRows,
  type Filters,
  type Row,
  type SortKey,
} from '../lib/filters'
import { useData } from '../state/DataContext'
import { useToday } from '../state/useToday'
import type { ItemType } from '../types'

const TYPE_CHIPS: { value: ItemType | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'consumable', label: '소모품' },
  { value: 'oneTime', label: '일회성' },
]

export default function Home() {
  const { items, purchases, loading } = useData()
  const [sheetOpen, setSheetOpen] = useState(false)
  // 필터·정렬은 주소에 둔다. 상세 화면에 갔다 와도 살아 있어야 한다
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => filtersFromParams(params), [params])
  const sort = useMemo(() => sortFromParams(params), [params])

  const commit = (nextFilters: Filters, nextSort: SortKey = sort) =>
    // replace를 쓴다 — 글자를 칠 때마다 히스토리가 쌓이면 뒤로가기가 망가진다
    setParams(paramsFromState(nextFilters, nextSort), { replace: true })

  // 파생값 계산은 한 번만 하고 필터·정렬이 함께 쓴다
  const today = useToday()
  const rows = useMemo<Row[]>(() => {
    return items.map((item) => {
      const own = purchases.filter((p) => p.itemId === item.id)
      return { item, purchases: own, stats: cardStats(own, today) }
    })
  }, [items, purchases, today])

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [items],
  )

  const visible = useMemo(() => sortRows(applyFilters(rows, filters), sort), [rows, filters, sort])

  const filtering = hasActiveFilter(filters)

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    commit({ ...filters, [key]: value })
  }

  return (
    <>
      <header className="border-b border-neutral-200 bg-neutral-50 px-4 pt-3 pb-2">
        <h1 className="text-lg font-semibold">자취 생활용품</h1>

        <div className="relative mt-3">
          <Search
            size={18}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400"
          />
          <input
            type="search"
            value={filters.query}
            onChange={(e) => update('query', e.target.value)}
            placeholder="품목명, 브랜드, 카테고리"
            aria-label="물품 검색"
            className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white pr-10 pl-10 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          {filters.query && (
            <button
              onClick={() => update('query', '')}
              aria-label="검색어 지우기"
              className="absolute top-1/2 right-0.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-400"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* 칩 줄은 좁은 화면에서 가로 스크롤한다 */}
        <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {/*
            타입은 셋 중 하나를 고르는 것이라 붙여서 세그먼트로 보이게 한다.
            옆의 토글 칩과 생김새가 같으면 "다시 누르면 꺼지겠지" 하고 눌렀다가
            아무 일도 일어나지 않아 헷갈린다.
          */}
          <div
            role="radiogroup"
            aria-label="타입"
            className="flex shrink-0 overflow-hidden rounded-full border border-neutral-300 bg-white"
          >
            {TYPE_CHIPS.map((chip) => {
              const active = filters.type === chip.value
              return (
                <button
                  key={chip.value}
                  role="radio"
                  aria-checked={active}
                  onClick={() => update('type', chip.value)}
                  className={`min-h-11 rounded-full px-3.5 text-sm whitespace-nowrap transition ${
                    active ? 'bg-indigo-600 text-white' : 'text-neutral-600'
                  }`}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
          <Chip active={filters.soonOnly} onClick={() => update('soonOnly', !filters.soonOnly)}>
            소진 임박
          </Chip>
          {categories.map((category) => (
            <Chip
              key={category}
              active={filters.category === category}
              onClick={() =>
                update('category', filters.category === category ? null : category)
              }
            >
              {category}
            </Chip>
          ))}
        </div>

        <div className="mt-1 flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            {loading ? ' ' : `${visible.length}개`}
            {filtering && !loading && ` / 전체 ${rows.length}개`}
          </p>
          <label className="flex items-center gap-1 text-sm text-neutral-500">
            <span className="sr-only">정렬 기준</span>
            <select
              value={sort}
              onChange={(e) => commit(filters, e.target.value as SortKey)}
              className="min-h-11 rounded-lg bg-transparent py-1 pr-1 text-sm text-neutral-700 outline-none"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className="px-4 py-4">
        {/* G8 — 첫 로드가 끝나기 전에는 "없음"이라고 말하지 않는다 */}
        {loading ? (
          <ul className="space-y-3">
            <li>
              <CardSkeleton />
            </li>
            <li>
              <CardSkeleton />
            </li>
          </ul>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Package size={40} strokeWidth={1.5} />}
            title="아직 기록한 물품이 없어요."
            description="+ 버튼으로 첫 물품을 등록해보세요."
          />
        ) : visible.length === 0 ? (
          <>
            <EmptyState
              icon={<SearchX size={40} strokeWidth={1.5} />}
              title="조건에 맞는 물품이 없어요."
              description="검색어나 필터를 바꿔보세요."
            />
            <button
              onClick={() => commit(EMPTY_FILTERS)}
              className="mx-auto flex min-h-11 items-center rounded-xl border border-neutral-300 px-4 text-sm font-medium text-neutral-700"
            >
              필터 초기화
            </button>
          </>
        ) : (
          <ul className="space-y-3">
            {visible.map(({ item, purchases: own, stats }) => (
              <ItemCard key={item.id} item={item} purchases={own} stats={stats} />
            ))}
          </ul>
        )}
      </main>

      <button
        onClick={() => setSheetOpen(true)}
        aria-label="물품 추가"
        // G10 — 하단 탭바(56px) + safe-area 위에 뜨도록 띄운다
        className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex size-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg active:bg-indigo-700"
      >
        <Plus size={26} />
      </button>

      <Sheet open={sheetOpen} title="물품 추가" onClose={() => setSheetOpen(false)}>
        <ItemForm onDone={() => setSheetOpen(false)} />
      </Sheet>
    </>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      // 칩은 작아 보이지만 터치 타겟은 44px를 지킨다 (SPEC 7절)
      className={`min-h-11 shrink-0 rounded-full border px-3.5 text-sm whitespace-nowrap transition ${
        active
          ? 'border-indigo-600 bg-indigo-600 text-white'
          : 'border-neutral-300 bg-white text-neutral-600'
      }`}
    >
      {children}
    </button>
  )
}
