import { addDays, differenceInCalendarDays } from 'date-fns'
import type { Purchase } from '../types'
import { parseDate, toDateStr } from './format'
import { totalUnitsOf, unitsPerPack } from './units'

/**
 * 저장된 이력을 포장 단위에서 셈 단위로 옮긴다 (v1 → v2).
 *
 * v1은 "6롤짜리 1팩"을 통째로 1개로 셌다. 그래서 6롤을 사도 남은 개수가 "1롤"로 보였고,
 * 한 롤만 쓰고 줄일 방법도 없었다. v2는 롤·장·개·팩을 낱개로 센다.
 *
 * 소진일도 함께 옮겨야 한다. 날짜 하나를 제자리에서 6번 반복하면 "하루에 6롤을 다 썼다"가 되어
 * 1개당 평균이 6배로 부풀고 예측이 통째로 어긋난다. 대신 그 팩을 쓴 구간에 고르게 펴서
 * "그 기간에 6롤을 썼다"는 원래 사실을 지킨다.
 *
 * 바꿀 게 없으면 null. 낱개로 세지 않는 단위(L·kg)와 한 포장이 1개인 이력은 그대로 맞다.
 */
export function toCountingUnits(p: Purchase): Purchase | null {
  const perPack = unitsPerPack(p)
  if (perPack <= 1) return null

  const dates: string[] = []
  let prev = p.purchaseDate
  for (const date of [...p.depletionDates].sort()) {
    dates.push(...spread(prev, date, perPack))
    prev = date
  }

  const total = totalUnitsOf(p)
  return {
    ...p,
    remaining: Math.min(Math.max(0, Math.round(p.remaining * perPack)), total),
    depletionDates: dates.sort(),
  }
}

/** [prev, date] 구간에 소진 count건을 고르게 편다. 마지막 한 건은 date 그대로 둔다. */
function spread(prev: string, date: string, count: number): string[] {
  const span = differenceInCalendarDays(parseDate(date), parseDate(prev))
  // 같은 날이거나 구매일보다 앞선 잘못된 데이터. 펼 구간이 없으니 그 날짜에 모아 둔다
  if (span <= 0) return Array<string>(count).fill(date)

  const start = parseDate(prev)
  return Array.from({ length: count }, (_, i) =>
    toDateStr(addDays(start, Math.round((span * (i + 1)) / count))),
  )
}
