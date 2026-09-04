import { describe, expect, it } from 'vitest'
import type { Purchase } from '../types'
import { avgDaysPerUnit } from './calc'
import { toCountingUnits } from './migrate'

function purchase(over: Partial<Purchase> = {}): Purchase {
  return {
    id: 'p',
    itemId: 'i',
    quantity: 1,
    remaining: 1,
    price: 0,
    purchaseDate: '2025-01-01',
    depletionDates: [],
    hasReceipt: false,
    ...over,
  }
}

describe('v1 → v2 셈 단위 이전', () => {
  it('6롤짜리 1팩은 남은 개수가 1이 아니라 6이 된다', () => {
    const next = toCountingUnits(purchase({ volume: 6, unit: '롤', quantity: 1, remaining: 1 }))
    expect(next?.remaining).toBe(6)
  })

  it('여러 팩도 낱개로 편다', () => {
    // 6롤짜리 2팩 중 1팩이 남았다 → 6롤
    const next = toCountingUnits(purchase({ volume: 6, unit: '롤', quantity: 2, remaining: 1 }))
    expect(next?.remaining).toBe(6)
  })

  it('소진일을 그 팩을 쓴 구간에 고르게 편다', () => {
    // 01-01에 산 6롤짜리 1팩을 01-31에 다 썼다 = 30일 동안 6롤
    const next = toCountingUnits(
      purchase({
        volume: 6,
        unit: '롤',
        quantity: 1,
        remaining: 0,
        depletionDates: ['2025-01-31'],
      }),
    )

    expect(next?.depletionDates).toEqual([
      '2025-01-06',
      '2025-01-11',
      '2025-01-16',
      '2025-01-21',
      '2025-01-26',
      '2025-01-31',
    ])
    // 제자리에서 6번 반복했다면 1롤당 30일이 되어 예측이 6배로 늘어졌을 것이다
    expect(avgDaysPerUnit([next as Purchase])).toBeCloseTo(5)
    expect(next?.remaining).toBe(0)
  })

  it('같은 날 사서 같은 날 소진한 기록은 그 날짜에 모아 둔다', () => {
    const next = toCountingUnits(
      purchase({ volume: 3, unit: '롤', quantity: 1, remaining: 0, depletionDates: ['2025-01-01'] }),
    )
    expect(next?.depletionDates).toEqual(['2025-01-01', '2025-01-01', '2025-01-01'])
  })

  it('남은 개수가 총 개수를 넘지 않는다', () => {
    const next = toCountingUnits(purchase({ volume: 6, unit: '롤', quantity: 1, remaining: 99 }))
    expect(next?.remaining).toBe(6)
  })

  it('L·kg는 원래부터 포장 개수로 세므로 건드리지 않는다', () => {
    expect(toCountingUnits(purchase({ volume: 3, unit: 'L', quantity: 2, remaining: 2 }))).toBeNull()
    expect(toCountingUnits(purchase({ volume: 1.5, unit: 'kg', quantity: 1 }))).toBeNull()
  })

  it('한 포장이 1개면 이미 맞는 값이다', () => {
    expect(toCountingUnits(purchase({ volume: 1, unit: '롤', quantity: 6, remaining: 6 }))).toBeNull()
    expect(toCountingUnits(purchase())).toBeNull()
  })
})
