import { describe, expect, it } from 'vitest'
import type { Purchase } from '../types'
import {
  countingUnitOf,
  fromStandard,
  groupOf,
  isMixedUnit,
  standardUnitOf,
  standardUnitsOf,
  toStandard,
} from './units'

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

describe('그룹 분류', () => {
  it('단위를 그룹으로 나눈다', () => {
    expect(groupOf('ml')).toBe('volume')
    expect(groupOf('kg')).toBe('weight')
    expect(groupOf('롤')).toBe('count')
  })
})

describe('표준 단위 환산', () => {
  it('volume은 L로 모은다', () => {
    expect(standardUnitOf('ml')).toBe('L')
    expect(toStandard(500, 'ml')).toBeCloseTo(0.5)
    expect(toStandard(3, 'L')).toBe(3)
  })

  it('weight는 kg로 모은다', () => {
    expect(standardUnitOf('g')).toBe('kg')
    expect(toStandard(1500, 'g')).toBeCloseTo(1.5)
  })

  it('count는 환산하지 않고 자기 자신이 표준이다', () => {
    // 30롤을 "30개"로 부르면 의미가 사라진다
    expect(standardUnitOf('롤')).toBe('롤')
    expect(standardUnitOf('장')).toBe('장')
    expect(toStandard(30, '롤')).toBe(30)
  })

  it('되돌리면 원래 값이다', () => {
    expect(fromStandard(toStandard(500, 'ml'), 'ml')).toBeCloseTo(500)
    expect(fromStandard(toStandard(1500, 'g'), 'g')).toBeCloseTo(1500)
  })
})

describe('단위 혼재 판정', () => {
  it('ml과 L은 섞인 것이 아니다', () => {
    const ps = [purchase({ volume: 500, unit: 'ml' }), purchase({ volume: 3, unit: 'L' })]
    expect(standardUnitsOf(ps)).toEqual(['L'])
    expect(isMixedUnit(ps)).toBe(false)
  })

  it('L과 롤은 섞인 것이다', () => {
    const ps = [purchase({ volume: 3, unit: 'L' }), purchase({ volume: 30, unit: '롤' })]
    expect(isMixedUnit(ps)).toBe(true)
  })

  it('롤과 장도 서로 환산할 수 없으므로 섞인 것이다', () => {
    const ps = [purchase({ volume: 30, unit: '롤' }), purchase({ volume: 100, unit: '장' })]
    expect(isMixedUnit(ps)).toBe(true)
  })

  it('용량 없는 이력(일회성)은 무시한다', () => {
    const ps = [purchase({ volume: 3, unit: 'L' }), purchase()]
    expect(isMixedUnit(ps)).toBe(false)
  })
})

describe('남은 개수 세는 단위 (A9)', () => {
  it('volume/weight는 개로 센다', () => {
    expect(countingUnitOf('L')).toBe('개')
    expect(countingUnitOf('kg')).toBe('개')
  })

  it('count는 그 단위로 센다', () => {
    expect(countingUnitOf('롤')).toBe('롤')
  })

  it('단위가 없으면 개로 센다', () => {
    expect(countingUnitOf(undefined)).toBe('개')
  })
})
