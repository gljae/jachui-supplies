import { format, subMonths } from 'date-fns'
import type { Item, Purchase } from '../types'

/**
 * 통계 계산. calc.ts와 같은 규칙으로 순수 함수만 둔다 —
 * new Date()를 부르지 않고 오늘을 인자로 받는다.
 */

export interface CategorySpend {
  category: string
  total: number
}

export interface MonthSpend {
  /** yyyy-MM */
  month: string
  total: number
}

/** yyyy-MM-dd → yyyy-MM */
export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

/** 오늘을 포함해 count개월을 오래된 순으로 */
export function lastMonths(today: Date, count: number): string[] {
  const months: string[] = []
  for (let back = count - 1; back >= 0; back--) {
    months.push(format(subMonths(today, back), 'yyyy-MM'))
  }
  return months
}

export function totalInMonth(purchases: Purchase[], month: string): number {
  return purchases
    .filter((p) => monthKey(p.purchaseDate) === month)
    .reduce((sum, p) => sum + p.price, 0)
}

export function countInMonth(purchases: Purchase[], month: string): number {
  return purchases.filter((p) => monthKey(p.purchaseDate) === month).length
}

function itemMap(items: Item[]): Map<string, Item> {
  return new Map(items.map((i) => [i.id, i]))
}

export function spendByType(
  purchases: Purchase[],
  items: Item[],
): { consumable: number; oneTime: number } {
  const byId = itemMap(items)
  const totals = { consumable: 0, oneTime: 0 }

  for (const purchase of purchases) {
    const item = byId.get(purchase.itemId)
    // 품목이 사라진 고아 이력은 세지 않는다. 어느 쪽에 넣어도 틀린 값이 된다
    if (!item) continue
    totals[item.type] += purchase.price
  }
  return totals
}

/** 전체 이력 합산, 금액이 큰 순 */
export function spendByCategory(purchases: Purchase[], items: Item[]): CategorySpend[] {
  const byId = itemMap(items)
  const totals = new Map<string, number>()

  for (const purchase of purchases) {
    const item = byId.get(purchase.itemId)
    if (!item) continue
    totals.set(item.category, (totals.get(item.category) ?? 0) + purchase.price)
  }

  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => {
      if (a.total !== b.total) return b.total - a.total
      // 금액이 같으면 이름으로 갈라 순서가 흔들리지 않게 한다
      return a.category.localeCompare(b.category, 'ko')
    })
}

/** 지출이 없는 달도 0으로 채워 선이 끊기지 않게 한다 */
export function monthlySeries(purchases: Purchase[], months: string[]): MonthSpend[] {
  const totals = new Map<string, number>()
  for (const purchase of purchases) {
    const key = monthKey(purchase.purchaseDate)
    totals.set(key, (totals.get(key) ?? 0) + purchase.price)
  }
  return months.map((month) => ({ month, total: totals.get(month) ?? 0 }))
}
