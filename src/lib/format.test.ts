import { describe, expect, it } from 'vitest'
import { formatDate, formatDays, formatKRW, formatUnitValue, parseDate, todayStr } from './format'

describe('G1 — 날짜는 로컬 기준이어야 한다', () => {
  it('날짜 문자열을 로컬 자정으로 파싱한다', () => {
    const d = parseDate('2025-01-01')
    // new Date('2025-01-01')이었다면 음수 오프셋 지역에서 2024-12-31이 된다
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(1)
  })

  it('새벽 시간에도 오늘 날짜가 밀리지 않는다', () => {
    // KST 새벽 3시 = UTC 전날 18시. toISOString().slice(0,10)이었다면 어제가 된다
    expect(todayStr(new Date(2025, 0, 2, 3, 0, 0))).toBe('2025-01-02')
  })

  it('자정 직후와 자정 직전이 같은 날이다', () => {
    expect(todayStr(new Date(2025, 5, 15, 0, 0, 1))).toBe('2025-06-15')
    expect(todayStr(new Date(2025, 5, 15, 23, 59, 59))).toBe('2025-06-15')
  })
})

describe('표시 포맷', () => {
  it('통화는 천 단위 구분자를 쓴다', () => {
    expect(formatKRW(18000)).toBe('₩18,000')
    expect(formatKRW(1234.6)).toBe('₩1,235')
  })

  it('날짜는 YYYY.MM.DD', () => {
    expect(formatDate('2025-01-31')).toBe('2025.01.31')
  })

  it('용량은 불필요한 0을 뗀다', () => {
    expect(formatUnitValue(3, 'L')).toBe('3L')
    expect(formatUnitValue(1.5, 'L')).toBe('1.5L')
    expect(formatUnitValue(500, 'ml')).toBe('500ml')
  })

  it('30일 이상이면 개월을 병기한다 (A16)', () => {
    expect(formatDays(24)).toBe('24일')
    expect(formatDays(62)).toBe('62일 (약 2.0개월)')
  })
})
