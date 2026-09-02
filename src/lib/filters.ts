import type { CardStats } from '../components/ItemCard'
import type { Item, ItemType, Purchase } from '../types'

export type SortKey = 'soon' | 'recent' | 'name' | 'spent'

export const SORT_LABELS: Record<SortKey, string> = {
  soon: '소진 임박순',
  recent: '최근 구매순',
  name: '이름순',
  spent: '누적 지출순',
}

export interface Row {
  item: Item
  purchases: Purchase[]
  stats: CardStats
}

export interface Filters {
  query: string
  type: ItemType | 'all'
  category: string | null
  soonOnly: boolean
}

export const EMPTY_FILTERS: Filters = { query: '', type: 'all', category: null, soonOnly: false }

export const DEFAULT_SORT: SortKey = 'soon'

const TYPES: (ItemType | 'all')[] = ['all', 'consumable', 'oneTime']

/**
 * 필터·정렬 상태를 URL에 둔다.
 *
 * 컴포넌트 state에 두면 상세 화면에 들어갔다 오는 순간 Home이 다시 마운트되면서
 * 전부 초기화된다. 목록을 좁혀 항목을 열어보고 돌아오는 게 기본 흐름인데
 * 그때마다 필터가 풀리면 필터를 쓸 이유가 없어진다.
 *
 * 주소에서 온 값은 믿지 않는다 — 모르는 값이면 기본값으로 되돌린다.
 */
export function filtersFromParams(params: URLSearchParams): Filters {
  const type = params.get('type')
  return {
    query: params.get('q') ?? '',
    type: TYPES.includes(type as ItemType | 'all') ? (type as ItemType | 'all') : 'all',
    category: params.get('cat'),
    soonOnly: params.get('soon') === '1',
  }
}

export function sortFromParams(params: URLSearchParams): SortKey {
  const sort = params.get('sort')
  return sort != null && sort in SORT_LABELS ? (sort as SortKey) : DEFAULT_SORT
}

/** 기본값은 주소에 넣지 않는다. 아무것도 안 건드렸으면 주소도 깨끗하다. */
export function paramsFromState(filters: Filters, sort: SortKey): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.query.trim() !== '') params.set('q', filters.query)
  if (filters.type !== 'all') params.set('type', filters.type)
  if (filters.category !== null) params.set('cat', filters.category)
  if (filters.soonOnly) params.set('soon', '1')
  if (sort !== DEFAULT_SORT) params.set('sort', sort)
  return params
}

export function hasActiveFilter(filters: Filters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.type !== 'all' ||
    filters.category !== null ||
    filters.soonOnly
  )
}

/** 품목명·브랜드·카테고리에서 찾는다 */
function matchesQuery(row: Row, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true

  if (row.item.name.toLowerCase().includes(needle)) return true
  if (row.item.category.toLowerCase().includes(needle)) return true
  return row.purchases.some((p) => p.brand?.toLowerCase().includes(needle))
}

export function applyFilters(rows: Row[], filters: Filters): Row[] {
  return rows.filter((row) => {
    if (filters.type !== 'all' && row.item.type !== filters.type) return false
    if (filters.category !== null && row.item.category !== filters.category) return false
    // 재고 없음도 "지금 사야 하는 것"이므로 임박에 포함한다
    if (filters.soonOnly) {
      const status = row.stats.depletion.status
      if (status !== 'soon' && status !== 'outOfStock') return false
    }
    return matchesQuery(row, filters.query)
  })
}

/**
 * 소진 임박순 정렬용 그룹.
 * G8 — daysLeft가 없는 항목(데이터 수집 중)을 0으로 취급하면 목록 맨 위를 차지한다.
 * 재고 없음이 가장 급하고, 그다음이 남은 일수 순, 예측할 수 없는 것은 맨 뒤다.
 */
function urgencyGroup(row: Row): number {
  const { status, daysLeft } = row.stats.depletion
  if (status === 'outOfStock') return 0
  if (daysLeft != null) return 1
  return 2
}

export function sortRows(rows: Row[], key: SortKey): Row[] {
  const sorted = [...rows]

  switch (key) {
    case 'soon':
      sorted.sort((a, b) => {
        const groupDiff = urgencyGroup(a) - urgencyGroup(b)
        if (groupDiff !== 0) return groupDiff

        const left = a.stats.depletion.daysLeft
        const right = b.stats.depletion.daysLeft
        if (left != null && right != null && left !== right) return left - right

        return a.item.name.localeCompare(b.item.name, 'ko')
      })
      break

    case 'recent':
      sorted.sort((a, b) => {
        const left = a.stats.latest?.purchaseDate ?? ''
        const right = b.stats.latest?.purchaseDate ?? ''
        if (left !== right) return left < right ? 1 : -1
        return a.item.name.localeCompare(b.item.name, 'ko')
      })
      break

    case 'name':
      // 한글은 localeCompare 없이 정렬하면 순서가 어색해진다
      sorted.sort((a, b) => a.item.name.localeCompare(b.item.name, 'ko'))
      break

    case 'spent':
      sorted.sort((a, b) => {
        if (a.stats.spent !== b.stats.spent) return b.stats.spent - a.stats.spent
        return a.item.name.localeCompare(b.item.name, 'ko')
      })
      break
  }

  return sorted
}
