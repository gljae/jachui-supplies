import { describe, expect, it } from 'vitest'
import type { Purchase } from '../types'
import {
  avgDaysPerStandardVolume,
  avgDaysPerUnit,
  avgPurchaseIntervalDays,
  currentUnitOpenedAt,
  cycleOptions,
  predictDepletion,
  representativePurchase,
  stockEvents,
  totalRemaining,
  totalSpent,
  unitPrice,
  usageGaps,
} from './calc'

let seq = 0
function purchase(over: Partial<Purchase> = {}): Purchase {
  return {
    id: `p${seq++}`,
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

/** 로컬 자정 Date. new Date('...')은 UTC 파싱이라 쓰지 않는다 (G1) */
function day(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// ─── 2-1. 1개당 실사용 일수 ────────────────────────────────────────────────

describe('2-1 실사용 일수 표본', () => {
  it('첫 소진은 구매일부터, 이후는 직전 소진일부터 잰다', () => {
    const p = purchase({ purchaseDate: '2025-01-01', depletionDates: ['2025-01-25', '2025-02-20'] })
    expect(usageGaps(p)).toEqual([24, 26])
  })

  it('소진 이력이 없으면 표본이 없다', () => {
    expect(usageGaps(purchase())).toEqual([])
    expect(avgDaysPerUnit([purchase()])).toBeNull()
  })

  it('소진일이 뒤섞여 들어와도 정렬해서 계산한다', () => {
    const p = purchase({ purchaseDate: '2025-01-01', depletionDates: ['2025-02-20', '2025-01-25'] })
    expect(usageGaps(p)).toEqual([24, 26])
  })

  it('여러 이력의 표본을 합쳐 평균 낸다', () => {
    const ps = [
      purchase({ purchaseDate: '2025-01-01', depletionDates: ['2025-01-25', '2025-02-20'] }), // 24, 26
      purchase({ purchaseDate: '2025-03-01', depletionDates: ['2025-03-21'] }), // 20
    ]
    expect(avgDaysPerUnit(ps)).toBeCloseTo((24 + 26 + 20) / 3) // 23.33
  })

  it('G3 — 0일 표본은 버린다', () => {
    const p = purchase({ purchaseDate: '2025-01-01', depletionDates: ['2025-01-01', '2025-01-11'] })
    expect(usageGaps(p)).toEqual([10])
  })

  it('G3 — 구매일보다 앞선 소진일(잘못된 데이터)은 버린다', () => {
    const p = purchase({ purchaseDate: '2025-02-01', depletionDates: ['2025-01-01'] })
    expect(usageGaps(p)).toEqual([])
  })
})

// ─── 2-2. 주기 표시 단위 변환 ─────────────────────────────────────────────

describe('2-2 용량당 주기', () => {
  /** 3L짜리를 30일, 1L짜리를 15일에 썼다 */
  const mixedVolume = [
    purchase({ purchaseDate: '2025-01-01', depletionDates: ['2025-01-31'], volume: 3, unit: 'L' }),
    purchase({ purchaseDate: '2025-03-01', depletionDates: ['2025-03-16'], volume: 1, unit: 'L' }),
  ]

  it('왜곡 방지 — 표본별로 먼저 나눈 뒤 평균 낸다', () => {
    // mean(30/3, 15/1) = mean(10, 15) = 12.5
    expect(avgDaysPerStandardVolume(mixedVolume)).toBeCloseTo(12.5)
    // 총합끼리 나눴다면 45/4 = 11.25가 나왔을 것이다
    expect(avgDaysPerStandardVolume(mixedVolume)).not.toBeCloseTo(11.25)
  })

  it('ml과 L이 섞여도 표준 단위로 환산해 계산한다', () => {
    const ps = [
      purchase({ purchaseDate: '2025-01-01', depletionDates: ['2025-01-11'], volume: 500, unit: 'ml' }),
      purchase({ purchaseDate: '2025-02-01', depletionDates: ['2025-02-21'], volume: 1, unit: 'L' }),
    ]
    // mean(10 / 0.5, 20 / 1) = mean(20, 20) = 20
    expect(avgDaysPerStandardVolume(ps)).toBeCloseTo(20)
  })

  it('대표 이력은 용량이 있는 가장 최근 구매다 (A8)', () => {
    expect(representativePurchase(mixedVolume)?.volume).toBe(1)
  })

  it('토글 3종의 값과 라벨', () => {
    const [perUnit, perVolume, perStandard] = cycleOptions(mixedVolume)

    expect(perUnit.enabled).toBe(true)
    expect(perUnit.days).toBeCloseTo(22.5) // mean(30, 15)
    expect(perUnit.label).toBe('개당')

    expect(perVolume.enabled).toBe(true)
    expect(perVolume.days).toBeCloseTo(12.5) // 대표가 1L이므로 12.5 × 1
    expect(perVolume.label).toBe('1L당')

    expect(perStandard.enabled).toBe(true)
    expect(perStandard.days).toBeCloseTo(12.5)
    expect(perStandard.label).toBe('1L당')
  })

  it('대표 용량이 3L면 perVolume은 3배가 된다', () => {
    const ps = [
      purchase({ purchaseDate: '2025-01-01', depletionDates: ['2025-01-31'], volume: 3, unit: 'L' }),
    ]
    const [, perVolume, perStandard] = cycleOptions(ps)
    expect(perStandard.days).toBeCloseTo(10)
    expect(perVolume.days).toBeCloseTo(30)
    expect(perVolume.label).toBe('3L당')
  })

  it('환산할 수 없는 단위가 섞이면 용량 토글이 꺼진다', () => {
    const ps = [
      purchase({ purchaseDate: '2025-01-01', depletionDates: ['2025-01-31'], volume: 3, unit: 'L' }),
      purchase({ purchaseDate: '2025-03-01', depletionDates: ['2025-03-16'], volume: 30, unit: '롤' }),
    ]
    const [perUnit, perVolume, perStandard] = cycleOptions(ps)
    expect(perUnit.enabled).toBe(true)
    expect(perVolume.enabled).toBe(false)
    expect(perStandard.enabled).toBe(false)
  })

  it('용량이 없는 일회성은 개당만 남는다', () => {
    const ps = [purchase({ purchaseDate: '2025-01-01', depletionDates: ['2025-01-31'] })]
    const [perUnit, perVolume, perStandard] = cycleOptions(ps)
    expect(perUnit.enabled).toBe(true)
    expect(perVolume.enabled).toBe(false)
    expect(perStandard.enabled).toBe(false)
  })

  it('G3 — 용량이 0이어도 Infinity가 새어 나오지 않는다', () => {
    const ps = [
      purchase({ purchaseDate: '2025-01-01', depletionDates: ['2025-01-31'], volume: 0, unit: 'L' }),
      purchase({ purchaseDate: '2025-03-01', depletionDates: ['2025-03-16'], volume: 1, unit: 'L' }),
    ]
    const result = avgDaysPerStandardVolume(ps)
    expect(Number.isFinite(result as number)).toBe(true)
    expect(result).toBeCloseTo(15)
  })
})

// ─── 2-3. 단순 구매 주기 ──────────────────────────────────────────────────

describe('2-3 단순 구매 주기', () => {
  it('인접 구매 간격의 평균', () => {
    const ps = [
      purchase({ purchaseDate: '2025-01-01' }),
      purchase({ purchaseDate: '2025-02-01' }), // 31
      purchase({ purchaseDate: '2025-03-03' }), // 30
    ]
    expect(avgPurchaseIntervalDays(ps)).toBeCloseTo(30.5)
  })

  it('이력이 1건이면 주기를 낼 수 없다', () => {
    expect(avgPurchaseIntervalDays([purchase()])).toBeNull()
    expect(avgPurchaseIntervalDays([])).toBeNull()
  })

  it('구매일 순서가 뒤섞여 있어도 정렬해서 계산한다', () => {
    const ps = [purchase({ purchaseDate: '2025-03-03' }), purchase({ purchaseDate: '2025-01-01' })]
    expect(avgPurchaseIntervalDays(ps)).toBe(61)
  })
})

// ─── G0. 개봉 시점 (재고 곡선 재생) ────────────────────────────────────────

describe('G0 개봉 시점', () => {
  it('구매를 같은 날 소진보다 먼저 적용한다', () => {
    const ps = [purchase({ purchaseDate: '2025-01-01', quantity: 1, depletionDates: ['2025-01-01'] })]
    expect(stockEvents(ps)).toEqual([
      { date: '2025-01-01', delta: 1 },
      { date: '2025-01-01', delta: -1 },
    ])
  })

  it('다 쓰고 한참 뒤 재구매하면 기준이 재구매일로 옮겨간다', () => {
    // SPEC의 `??`였다면 2025-02-01에 묶여 "몇 달 지남"이 됐을 상황
    const ps = [
      purchase({ purchaseDate: '2025-01-01', quantity: 1, remaining: 0, depletionDates: ['2025-02-01'] }),
      purchase({ purchaseDate: '2025-08-01', quantity: 1, remaining: 1 }),
    ]
    expect(currentUnitOpenedAt(ps)).toBe('2025-08-01')
  })

  it('재고가 남은 상태의 재구매는 기준을 리셋하지 않는다', () => {
    const ps = [
      purchase({ purchaseDate: '2025-01-01', quantity: 3, remaining: 2, depletionDates: ['2025-02-01'] }),
      purchase({ purchaseDate: '2025-02-15', quantity: 3, remaining: 3 }),
    ]
    expect(currentUnitOpenedAt(ps)).toBe('2025-02-01')
  })

  it('소진 이력이 없으면 재고가 채워진 마지막 날이 기준이다', () => {
    const ps = [
      purchase({ purchaseDate: '2025-01-01', quantity: 2, remaining: 2 }),
      purchase({ purchaseDate: '2025-02-01', quantity: 2, remaining: 2 }),
      purchase({ purchaseDate: '2025-03-01', quantity: 2, remaining: 2 }),
    ]
    // 재고가 0이었던 건 첫 구매 직전뿐이다
    expect(currentUnitOpenedAt(ps)).toBe('2025-01-01')
  })

  it('이력이 없으면 null', () => {
    expect(currentUnitOpenedAt([])).toBeNull()
  })
})

// ─── 2-4. 예상 소진일 ─────────────────────────────────────────────────────

describe('2-4 소진 예측', () => {
  /** 평균 30일로 쓰는 품목. 마지막 소진일은 인자로 받는다 */
  function consumable(lastDepletion: string, remaining = 1): Purchase[] {
    return [
      purchase({
        purchaseDate: '2025-01-01',
        quantity: 3,
        remaining,
        depletionDates: ['2025-01-31', lastDepletion],
      }),
    ]
  }

  it('여유가 있으면 ok', () => {
    // 마지막 소진 03-02(30일), 오늘 03-07 → 예상 04-01, 25일 남음
    const result = predictDepletion(consumable('2025-03-02'), day('2025-03-07'))
    expect(result.status).toBe('ok')
    expect(result.expectedDate).toBe('2025-04-01')
    expect(result.daysLeft).toBe(25)
  })

  it('7일 남으면 soon (경계 포함)', () => {
    const result = predictDepletion(consumable('2025-03-02'), day('2025-03-25'))
    expect(result.daysLeft).toBe(7)
    expect(result.status).toBe('soon')
  })

  it('8일 남으면 아직 ok', () => {
    const result = predictDepletion(consumable('2025-03-02'), day('2025-03-24'))
    expect(result.daysLeft).toBe(8)
    expect(result.status).toBe('ok')
  })

  it('예상일이 지나면 daysLeft가 음수이고 여전히 soon (A13)', () => {
    const result = predictDepletion(consumable('2025-03-02'), day('2025-04-04'))
    expect(result.daysLeft).toBe(-3)
    expect(result.status).toBe('soon')
  })

  it('재고 0은 데이터가 있어도 outOfStock이 먼저다 (A7)', () => {
    const result = predictDepletion(consumable('2025-03-02', 0), day('2025-03-07'))
    expect(result.status).toBe('outOfStock')
    expect(result.expectedDate).toBeNull()
  })

  it('표본이 없으면 collecting', () => {
    const ps = [purchase({ purchaseDate: '2025-01-01', quantity: 2, remaining: 2 })]
    expect(predictDepletion(ps, day('2025-03-07')).status).toBe('collecting')
  })

  it('이력이 아예 없으면 outOfStock', () => {
    expect(predictDepletion([], day('2025-03-07')).status).toBe('outOfStock')
  })
})

// ─── 남은 개수 · 단가 ─────────────────────────────────────────────────────

describe('A9 남은 개수 표기', () => {
  it('용량 단위는 개로, count 단위는 그 단위로 센다', () => {
    const ps = [
      purchase({ volume: 3, unit: 'L', remaining: 3 }),
      purchase({ volume: 30, unit: '롤', remaining: 2 }),
    ]
    expect(totalRemaining(ps)).toEqual([
      { label: '개', count: 3 },
      { label: '롤', count: 2 },
    ])
  })

  it('같은 세는 단위끼리는 합친다', () => {
    const ps = [
      purchase({ volume: 500, unit: 'ml', remaining: 1 }),
      purchase({ volume: 3, unit: 'L', remaining: 2 }),
    ]
    expect(totalRemaining(ps)).toEqual([{ label: '개', count: 3 }])
  })

  it('재고가 없으면 빈 배열', () => {
    expect(totalRemaining([purchase({ remaining: 0 })])).toEqual([])
  })
})

describe('2-5 단위당 단가', () => {
  it('총액을 총 용량으로 나눈다', () => {
    const p = purchase({ price: 9000, volume: 3, unit: 'L', quantity: 2 })
    expect(unitPrice(p)).toEqual({ value: 1500, unit: 'L' })
  })

  it('표준 단위로 환산해서 낸다', () => {
    const p = purchase({ price: 6000, volume: 500, unit: 'ml', quantity: 4 })
    const result = unitPrice(p)
    expect(result?.value).toBeCloseTo(3000)
    expect(result?.unit).toBe('L')
  })

  it('count 단위는 그 단위로 낸다', () => {
    const p = purchase({ price: 15000, volume: 30, unit: '롤', quantity: 1 })
    expect(unitPrice(p)).toEqual({ value: 500, unit: '롤' })
  })

  it('용량이 없는 일회성은 단가가 없다', () => {
    expect(unitPrice(purchase({ price: 30000 }))).toBeNull()
  })

  it('G3 — 용량이나 수량이 0이면 null (Infinity 방지)', () => {
    expect(unitPrice(purchase({ price: 9000, volume: 0, unit: 'L', quantity: 2 }))).toBeNull()
    expect(unitPrice(purchase({ price: 9000, volume: 3, unit: 'L', quantity: 0 }))).toBeNull()
  })
})

describe('누적 지출', () => {
  it('이력의 가격을 모두 더한다', () => {
    expect(totalSpent([purchase({ price: 9000 }), purchase({ price: 6000 })])).toBe(15000)
    expect(totalSpent([])).toBe(0)
  })
})
