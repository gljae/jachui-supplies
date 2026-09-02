import { format, parseISO } from 'date-fns'
import type { Unit } from '../types'

/** ₩1,234 */
export function formatKRW(value: number): string {
  return `₩${Math.round(value).toLocaleString('ko-KR')}`
}

/** 1,234원 */
export function formatWon(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

/** yyyy-MM-dd → 2025.01.31 */
export function formatDate(dateStr: string): string {
  return format(parseDate(dateStr), 'yyyy.MM.dd')
}

/** yyyy-MM-dd → 01/31 (차트 x축용) */
export function formatShortDate(dateStr: string): string {
  return format(parseDate(dateStr), 'MM/dd')
}

/**
 * yyyy-MM-dd 문자열을 로컬 자정 Date로 파싱한다.
 *
 * G1 — `new Date('2025-01-01')`은 UTC 자정으로 파싱돼 타임존에 따라 하루가 밀린다.
 * date-fns의 parseISO는 날짜만 있는 문자열을 로컬 자정으로 해석한다.
 */
export function parseDate(dateStr: string): Date {
  return parseISO(dateStr)
}

/**
 * 오늘 날짜를 yyyy-MM-dd로.
 *
 * G1 — `new Date().toISOString().slice(0,10)`은 UTC 날짜라 KST 00~09시에 어제가 된다.
 */
export function todayStr(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd')
}

export function toDateStr(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** 소수점 뒤 불필요한 0을 떼고 단위를 붙인다. 1.5 → "1.5L", 3 → "3L" */
export function formatUnitValue(value: number, unit: Unit): string {
  return `${trimNumber(value)}${unit}`
}

/** 표시용 숫자 정리. 소수 둘째 자리까지, 뒤따르는 0 제거 */
export function trimNumber(value: number, maxDecimals = 2): string {
  const rounded = Number(value.toFixed(maxDecimals))
  return rounded.toLocaleString('ko-KR', { maximumFractionDigits: maxDecimals })
}

/** 일수를 사람이 읽는 문구로. 30일 이상이면 개월을 병기한다 (A16) */
export function formatDays(days: number): string {
  const d = Math.round(days)
  if (days >= 30) return `${d}일 (약 ${(days / 30.44).toFixed(1)}개월)`
  return `${d}일`
}

/** 1만 이상은 "1.5만"으로 줄인다. 375px 차트에서 y축이 폭을 많이 먹지 않게 */
export function compactWon(value: number): string {
  if (value === 0) return '0'
  if (value >= 10000) {
    const man = value / 10000
    return `${Number.isInteger(man) ? man : man.toFixed(1)}만`
  }
  return value.toLocaleString('ko-KR')
}

/**
 * 축 눈금을 딱 떨어지는 숫자로 만든다.
 * recharts에 맡기면 최댓값에서 파생된 5,500 / 1.1만 / 2.2만 같은 값이 나와
 * 눈금이 제 역할(직접 라벨하지 않은 값을 읽게 하는 것)을 못 한다.
 */
export function niceTicks(max: number, intervals = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1]

  const rough = max / intervals
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10
  const top = Math.ceil(max / step) * step

  const ticks: number[] = []
  for (let value = 0; value <= top + step / 1000; value += step) ticks.push(Math.round(value))
  return ticks
}
