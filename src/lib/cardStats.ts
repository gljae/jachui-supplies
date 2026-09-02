import type { Purchase } from '../types'
import {
  avgDaysPerUnit,
  predictDepletion,
  totalRemaining,
  totalSpent,
  type DepletionResult,
} from './calc'

/**
 * 카드와 정렬이 함께 쓰는 파생값.
 *
 * 컴포넌트 파일에 두면 Fast Refresh가 무효화된다 — 컴포넌트가 아닌 것을 함께 내보내는
 * 파일은 갱신할 때마다 모듈 그래프를 다시 세우고, 편집이 몰리면 개발 서버가 낡은
 * 변환 결과를 붙잡는다.
 */
export interface CardStats {
  remaining: { label: string; count: number }[]
  avgDays: number | null
  depletion: DepletionResult
  latest: Purchase | null
  spent: number
}

export function cardStats(purchases: Purchase[], today: Date): CardStats {
  const latest = purchases.reduce<Purchase | null>(
    (best, p) => (!best || p.purchaseDate >= best.purchaseDate ? p : best),
    null,
  )
  return {
    remaining: totalRemaining(purchases),
    avgDays: avgDaysPerUnit(purchases),
    depletion: predictDepletion(purchases, today),
    latest,
    spent: totalSpent(purchases),
  }
}
