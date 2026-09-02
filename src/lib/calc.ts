import { addDays, differenceInCalendarDays } from 'date-fns'
import type { Purchase, Unit } from '../types'
import { formatUnitValue, parseDate, toDateStr } from './format'
import { countingUnitOf, isMixedUnit, standardUnitOf, toStandard } from './units'

/**
 * 주기·소진일·단가 계산.
 *
 * 이 파일은 순수 함수만 둔다. `new Date()`를 호출하지 않고(오늘은 인자로 받는다)
 * DOM에도 접근하지 않는다. 그래야 테스트가 실행 시각에 흔들리지 않는다.
 */

export interface UsageSample {
  /** 1개를 다 쓰는 데 걸린 일수 */
  days: number
  /** 그 1개의 용량(표준 단위 환산). 용량 정보가 없으면 null */
  volumeStd: number | null
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function volumeStdOf(p: Purchase): number | null {
  if (p.volume == null || p.unit == null) return null
  const std = toStandard(p.volume, p.unit)
  // G3 — 0이나 비정상 값이 표본에 들어가면 나눗셈이 Infinity가 되어 평균 전체를 오염시킨다
  return Number.isFinite(std) && std > 0 ? std : null
}

// ─── 2-1. 1개당 실사용 일수 ────────────────────────────────────────────────

/**
 * 이력 1건에서 "1개를 다 쓰는 데 걸린 일수" 표본을 뽑는다.
 * 첫 소진은 구매일부터, 이후는 직전 소진일부터 잰다.
 *
 * 0일 표본은 버린다(G3). 같은 날 사서 같은 날 소진 처리한 것은 하루 미만인지
 * 몰아서 입력한 것인지 구분할 수 없는데, 남겨두면 평균을 강하게 끌어내린다.
 * 표본이 전부 0이면 avgDaysPerUnit이 null이 되어 "데이터 수집 중"으로 떨어지는데,
 * 틀린 예측을 보여주는 것보다 낫다.
 */
export function usageGaps(p: Purchase): number[] {
  const dates = [...p.depletionDates].sort()
  const gaps: number[] = []
  let prev = p.purchaseDate

  for (const date of dates) {
    const days = differenceInCalendarDays(parseDate(date), parseDate(prev))
    // 음수는 구매일보다 앞선 소진일 = 잘못된 데이터(주로 가져오기). 버린다
    if (days > 0) gaps.push(days)
    prev = date
  }
  return gaps
}

export function usageSamples(purchases: Purchase[]): UsageSample[] {
  return purchases.flatMap((p) => {
    const volumeStd = volumeStdOf(p)
    return usageGaps(p).map((days) => ({ days, volumeStd }))
  })
}

export function avgDaysPerUnit(purchases: Purchase[]): number | null {
  return mean(usageSamples(purchases).map((s) => s.days))
}

/**
 * 2-2. 표준 단위 1개당 실사용 일수.
 *
 * 반드시 표본별로 (일수 ÷ 용량)을 먼저 구한 뒤 평균 낸다.
 * 총합끼리 나누면 용량이 큰 이력에 가중치가 쏠려 왜곡된다.
 * 3L 30일 + 1L 15일 → 올바른 값 mean(10, 15) = 12.5, 총합 방식 45/4 = 11.25.
 */
export function avgDaysPerStandardVolume(purchases: Purchase[]): number | null {
  // 서로 환산할 수 없는 단위가 섞였으면 평균 자체가 의미 없다
  if (isMixedUnit(purchases)) return null

  const perVolume = usageSamples(purchases)
    .filter((s) => s.volumeStd != null)
    .map((s) => s.days / (s.volumeStd as number))

  return mean(perVolume)
}

/** 표시 기준이 되는 이력. 용량이 있는 이력 중 가장 최근 구매 (A8) */
export function representativePurchase(purchases: Purchase[]): Purchase | null {
  let best: Purchase | null = null
  for (const p of purchases) {
    if (volumeStdOf(p) == null) continue
    if (!best || p.purchaseDate >= best.purchaseDate) best = p
  }
  return best
}

export type CycleMode = 'perUnit' | 'perVolume' | 'perStandard'

export interface CycleOption {
  mode: CycleMode
  enabled: boolean
  days: number | null
  /** 토글에 그대로 쓰는 문구. "개당", "3L당", "1L당" */
  label: string
}

/** 2-2. 주기 표시 단위 토글 3종. 기준값은 항상 avgDaysPerUnit이고 표시할 때만 환산한다. */
export function cycleOptions(purchases: Purchase[]): CycleOption[] {
  const perUnitDays = avgDaysPerUnit(purchases)
  const perStandardDays = avgDaysPerStandardVolume(purchases)
  const rep = representativePurchase(purchases)

  const standardUnit: Unit | null = rep?.unit ? standardUnitOf(rep.unit) : null
  const repVolumeStd = rep ? volumeStdOf(rep) : null

  return [
    {
      mode: 'perUnit',
      enabled: perUnitDays != null,
      days: perUnitDays,
      label: '1개당',
    },
    {
      mode: 'perVolume',
      enabled: perStandardDays != null && rep != null && repVolumeStd != null,
      days:
        perStandardDays != null && repVolumeStd != null ? perStandardDays * repVolumeStd : null,
      label: rep?.volume != null && rep.unit ? `${formatUnitValue(rep.volume, rep.unit)}당` : '',
    },
    {
      mode: 'perStandard',
      enabled: perStandardDays != null && standardUnit != null,
      days: perStandardDays,
      label: standardUnit ? `1${standardUnit}당` : '',
    },
  ]
}

// ─── 2-3. 단순 구매 주기 ──────────────────────────────────────────────────

export function avgPurchaseIntervalDays(purchases: Purchase[]): number | null {
  const dates = purchases.map((p) => p.purchaseDate).sort()
  if (dates.length < 2) return null

  const gaps: number[] = []
  for (let i = 1; i < dates.length; i++) {
    gaps.push(differenceInCalendarDays(parseDate(dates[i]), parseDate(dates[i - 1])))
  }
  return mean(gaps)
}

// ─── 2-4. 예상 소진일 ─────────────────────────────────────────────────────

export interface StockEvent {
  date: string
  /** 구매는 +quantity, 소진은 -1 */
  delta: number
}

/**
 * 구매·소진을 시간순 이벤트로 편다.
 * 같은 날짜면 구매를 먼저 적용한다 — 그래야 재고가 음수로 내려가지 않고,
 * "재고 0에서 다시 채워진 날"이 제대로 잡힌다.
 */
export function stockEvents(purchases: Purchase[]): StockEvent[] {
  const events: (StockEvent & { order: number })[] = []

  for (const p of purchases) {
    events.push({ date: p.purchaseDate, delta: p.quantity, order: 0 })
    for (const date of p.depletionDates) {
      events.push({ date, delta: -1, order: 1 })
    }
  }

  events.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1))
  return events.map(({ date, delta }) => ({ date, delta }))
}

/**
 * G0 — 지금 쓰고 있는 1개를 언제 개봉했는가.
 *
 * SPEC 2-4의 `마지막 depletionDate ?? 최근 purchaseDate`는 틀렸다. `??`는 소진 이력이
 * 하나라도 있으면 구매일을 무시하므로, 다 쓰고 한참 뒤에 재구매한 경우 기준 시점이
 * 옛날 소진일에 묶여 "몇 달 지남"으로 표시된다.
 *
 * 재고 곡선을 재생해서 판정한다:
 *   개봉 시점 = max(마지막 소진일, 재고가 0에서 양수로 바뀐 마지막 날)
 */
export function currentUnitOpenedAt(purchases: Purchase[]): string | null {
  const events = stockEvents(purchases)
  if (events.length === 0) return null

  let stock = 0
  let lastRefill: string | null = null

  for (const e of events) {
    if (e.delta > 0 && stock <= 0) lastRefill = e.date
    stock += e.delta
  }

  const allDepletions = purchases.flatMap((p) => p.depletionDates)
  const lastDepletion = allDepletions.length > 0 ? allDepletions.reduce((a, b) => (a > b ? a : b)) : null

  if (lastRefill && lastDepletion) return lastRefill > lastDepletion ? lastRefill : lastDepletion
  return lastRefill ?? lastDepletion
}

export type StockStatus = 'outOfStock' | 'collecting' | 'soon' | 'ok'

export interface DepletionResult {
  status: StockStatus
  /** yyyy-MM-dd */
  expectedDate: string | null
  /** 음수면 예상일이 지났다는 뜻 (G/A13) */
  daysLeft: number | null
}

/** 상태 우선순위는 outOfStock > collecting > soon > ok (A7). 재고가 없으면 예측이 무의미하다. */
export function predictDepletion(purchases: Purchase[], today: Date): DepletionResult {
  const remaining = purchases.reduce((sum, p) => sum + p.remaining, 0)
  if (remaining <= 0) return { status: 'outOfStock', expectedDate: null, daysLeft: null }

  const avg = avgDaysPerUnit(purchases)
  const openedAt = currentUnitOpenedAt(purchases)
  if (avg == null || openedAt == null) {
    return { status: 'collecting', expectedDate: null, daysLeft: null }
  }

  const expected = addDays(parseDate(openedAt), Math.round(avg))
  const daysLeft = differenceInCalendarDays(expected, today)

  return {
    status: daysLeft <= 7 ? 'soon' : 'ok',
    expectedDate: toDateStr(expected),
    daysLeft,
  }
}

// ─── 남은 개수 · 단가 ─────────────────────────────────────────────────────

/**
 * A9 — 남은 개수를 세는 단위별로 묶는다.
 * count 단위는 그 단위로(2롤), volume/weight는 포장 단위인 '개'로 센다(3개).
 * 0인 묶음은 빼므로, 재고가 전혀 없으면 빈 배열이 된다.
 */
export function totalRemaining(purchases: Purchase[]): { label: Unit; count: number }[] {
  const byUnit = new Map<Unit, number>()

  for (const p of purchases) {
    const label = countingUnitOf(p.unit)
    byUnit.set(label, (byUnit.get(label) ?? 0) + p.remaining)
  }

  return [...byUnit.entries()]
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, count }))
}

/** 2-5. 표준 단위당 단가. 용량이 없는 일회성은 null */
export function unitPrice(p: Purchase): { value: number; unit: Unit } | null {
  const volumeStd = volumeStdOf(p)
  if (volumeStd == null || p.unit == null || p.quantity <= 0) return null

  const totalVolume = volumeStd * p.quantity
  if (!Number.isFinite(totalVolume) || totalVolume <= 0) return null

  return { value: p.price / totalVolume, unit: standardUnitOf(p.unit) }
}

export function totalSpent(purchases: Purchase[]): number {
  return purchases.reduce((sum, p) => sum + p.price, 0)
}
