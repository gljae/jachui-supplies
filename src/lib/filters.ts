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
