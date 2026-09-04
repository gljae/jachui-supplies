import type { Purchase, Unit, UnitGroup } from '../types'

export const UNIT_GROUP: Record<Unit, UnitGroup> = {
  ml: 'volume',
  L: 'volume',
  g: 'weight',
  kg: 'weight',
  개: 'count',
  롤: 'count',
  장: 'count',
  팩: 'count',
}

export const ALL_UNITS = Object.keys(UNIT_GROUP) as Unit[]

/** 그룹의 표준 단위. count 그룹은 단위마다 의미가 달라 별도 처리한다(standardUnitOf 참조). */
export const STANDARD_UNIT: Record<UnitGroup, Unit> = {
  volume: 'L',
  weight: 'kg',
  count: '개',
}

/** 1 단위가 표준 단위로 몇인지. 1L = 1000ml, 1kg = 1000g */
const TO_STANDARD: Record<Unit, number> = {
  ml: 0.001,
  L: 1,
  g: 0.001,
  kg: 1,
  개: 1,
  롤: 1,
  장: 1,
  팩: 1,
}

export function groupOf(unit: Unit): UnitGroup {
  return UNIT_GROUP[unit]
}

/**
 * 환산 기준이 되는 단위.
 *
 * volume/weight는 그룹 표준(L, kg)으로 모은다 — 500ml와 1L은 서로 환산되므로 합쳐도 된다.
 * count는 단위 자체가 세는 대상이라 환산하지 않는다 — 30롤을 "30개"로 부르면 의미가 사라지고,
 * 롤과 장은 애초에 서로 환산할 수 없다. 그래서 count는 자기 자신이 표준이다.
 */
export function standardUnitOf(unit: Unit): Unit {
  const group = groupOf(unit)
  return group === 'count' ? unit : STANDARD_UNIT[group]
}

export function toStandard(value: number, unit: Unit): number {
  return value * TO_STANDARD[unit]
}

export function fromStandard(value: number, unit: Unit): number {
  return value / TO_STANDARD[unit]
}

/** 이력들이 쓰는 환산 기준 단위 목록 (중복 제거). 용량 없는 이력은 무시한다. */
export function standardUnitsOf(purchases: Purchase[]): Unit[] {
  const seen = new Set<Unit>()
  for (const p of purchases) {
    if (p.unit && p.volume != null) seen.add(standardUnitOf(p.unit))
  }
  return [...seen]
}

/**
 * 서로 환산할 수 없는 단위가 섞여 있는가.
 * ml + L은 섞인 게 아니고(둘 다 L로 환산), L + 롤이나 롤 + 장은 섞인 것이다.
 */
export function isMixedUnit(purchases: Purchase[]): boolean {
  return standardUnitsOf(purchases).length > 1
}

export function unitGroupsOf(purchases: Purchase[]): UnitGroup[] {
  const seen = new Set<UnitGroup>()
  for (const p of purchases) {
    if (p.unit) seen.add(groupOf(p.unit))
  }
  return [...seen]
}

/**
 * 남은 개수를 셀 때 붙일 라벨.
 * count 단위는 그 단위가 곧 세는 말이므로 그대로 쓰고(2롤), volume/weight는 포장 단위인 '개'로 센다(3개).
 */
export function countingUnitOf(unit: Unit | undefined): Unit {
  if (!unit) return '개'
  return groupOf(unit) === 'count' ? unit : '개'
}

/**
 * 포장 하나에 들어 있는 셈 단위 개수.
 *
 * count 단위는 용량이 곧 낱개 수다 — "6롤 1팩"은 6롤이고 롤 단위로 하나씩 쓴다.
 * volume/weight는 3L를 세 조각으로 뜯어 쓸 수 없으므로 포장 자체가 1개다.
 */
export function unitsPerPack(p: Pick<Purchase, 'volume' | 'unit'>): number {
  if (!p.unit || p.volume == null || groupOf(p.unit) !== 'count') return 1
  const units = Math.round(p.volume)
  return Number.isFinite(units) && units > 0 ? units : 1
}

/** 이력 1건이 담고 있는 총 개수(셈 단위 기준). 6롤 × 2팩 = 12롤, 3L × 2통 = 2개. */
export function totalUnitsOf(p: Pick<Purchase, 'volume' | 'unit' | 'quantity'>): number {
  const total = Math.round(p.quantity * unitsPerPack(p))
  return Number.isFinite(total) && total > 0 ? total : 0
}

/** 이력들이 공통으로 쓰는 셈 단위. 섞여 있으면 null (라벨을 한 단어로 못 정한다) */
export function commonCountingUnit(purchases: Purchase[]): Unit | null {
  const seen = new Set<Unit>()
  for (const p of purchases) seen.add(countingUnitOf(p.unit))
  return seen.size === 1 ? [...seen][0] : null
}
