import { describe, expect, it } from 'vitest'
import type { Item, ItemType, Purchase } from '../types'
import {
  countInMonth,
  lastMonths,
  monthKey,
  monthlySeries,
  spendByCategory,
  spendByType,
  totalInMonth,
} from './stats'

function item(id: string, category: string, type: ItemType = 'consumable'): Item {
  return { id, name: id, category, type, createdAt: '2026-01-01T00:00:00.000Z' }
}

function purchase(itemId: string, date: string, price: number): Purchase {
  return {
    id: `${itemId}-${date}-${price}`,
    itemId,
    quantity: 1,
    remaining: 1,
    price,
    purchaseDate: date,
    depletionDates: [],
    hasReceipt: false,
  }
}

const items = [
  item('세제', '생활용품'),
  item('휴지', '생활용품'),
  item('포트', '주방', 'oneTime'),
]

const purchases = [
  purchase('세제', '2026-09-01', 18000),
  purchase('휴지', '2026-09-15', 15000),
  purchase('포트', '2026-07-10', 89000),
  purchase('세제', '2026-06-01', 12000),
]

describe('월 키', () => {
  it('yyyy-MM-dd에서 yyyy-MM만 뗀다', () => {
    expect(monthKey('2026-09-03')).toBe('2026-09')
  })

  it('오늘 포함 최근 N개월을 오래된 순으로 준다', () => {
    // 로컬 자정 기준. new Date('...')은 UTC 파싱이라 쓰지 않는다 (G1)
    const today = new Date(2026, 8, 3)
    expect(lastMonths(today, 6)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ])
  })

  it('연도를 넘어가도 이어진다', () => {
    expect(lastMonths(new Date(2026, 1, 15), 3)).toEqual(['2025-12', '2026-01', '2026-02'])
  })
})

describe('이번 달 지출', () => {
  it('구매일이 그 달인 것만 더한다', () => {
    expect(totalInMonth(purchases, '2026-09')).toBe(33000)
    expect(countInMonth(purchases, '2026-09')).toBe(2)
  })

  it('지출이 없는 달은 0', () => {
    expect(totalInMonth(purchases, '2026-08')).toBe(0)
    expect(countInMonth(purchases, '2026-08')).toBe(0)
  })
})

describe('타입별 지출', () => {
  it('소모품과 일회성을 나눈다', () => {
    expect(spendByType(purchases, items)).toEqual({ consumable: 45000, oneTime: 89000 })
  })

  it('품목이 사라진 고아 이력은 세지 않는다', () => {
    const orphan = [...purchases, purchase('없는품목', '2026-09-01', 99999)]
    expect(spendByType(orphan, items)).toEqual({ consumable: 45000, oneTime: 89000 })
  })

  it('이력이 없으면 0', () => {
    expect(spendByType([], items)).toEqual({ consumable: 0, oneTime: 0 })
  })
})

describe('카테고리별 지출', () => {
  it('금액이 큰 순으로 준다', () => {
    expect(spendByCategory(purchases, items)).toEqual([
      { category: '주방', total: 89000 },
      { category: '생활용품', total: 45000 },
    ])
  })

  it('금액이 같으면 이름으로 갈린다 — 순서가 흔들리지 않게', () => {
    const same = [purchase('세제', '2026-09-01', 100), purchase('포트', '2026-09-01', 100)]
    expect(spendByCategory(same, items).map((c) => c.category)).toEqual(['생활용품', '주방'])
  })
})

describe('월별 추이', () => {
  it('지출이 없는 달도 0으로 채운다 — 선이 끊기지 않게', () => {
    const months = ['2026-06', '2026-07', '2026-08', '2026-09']
    expect(monthlySeries(purchases, months)).toEqual([
      { month: '2026-06', total: 12000 },
      { month: '2026-07', total: 89000 },
      { month: '2026-08', total: 0 },
      { month: '2026-09', total: 33000 },
    ])
  })

  it('이력이 없으면 전부 0', () => {
    expect(monthlySeries([], ['2026-08', '2026-09'])).toEqual([
      { month: '2026-08', total: 0 },
      { month: '2026-09', total: 0 },
    ])
  })
})
