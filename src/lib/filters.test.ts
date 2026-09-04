import { describe, expect, it } from 'vitest'
import type { CardStats } from './cardStats'
import type { Item, ItemType, Purchase } from '../types'
import type { StockStatus } from './calc'
import {
  applyFilters,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  filtersFromParams,
  hasActiveFilter,
  paramsFromState,
  sortFromParams,
  sortRows,
  type Filters,
  type Row,
} from './filters'

function row(
  name: string,
  over: {
    type?: ItemType
    category?: string
    status?: StockStatus
    daysLeft?: number | null
    spent?: number
    latestDate?: string
    brand?: string
  } = {},
): Row {
  const item: Item = {
    id: name,
    name,
    category: over.category ?? '생활용품',
    type: over.type ?? 'consumable',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
  const purchase: Purchase = {
    id: `${name}-p`,
    itemId: name,
    brand: over.brand,
    quantity: 1,
    remaining: 1,
    price: over.spent ?? 0,
    purchaseDate: over.latestDate ?? '2026-01-01',
    depletionDates: [],
    hasReceipt: false,
  }
  const stats: CardStats = {
    remaining: [],
    avgDays: null,
    countingUnit: '개',
    depletion: {
      status: over.status ?? 'ok',
      expectedDate: null,
      daysLeft: over.daysLeft === undefined ? 30 : over.daysLeft,
    },
    latest: purchase,
    spent: over.spent ?? 0,
  }
  return { item, purchases: [purchase], stats }
}

describe('소진 임박순 정렬', () => {
  it('G8 — 데이터 수집 중(daysLeft 없음)은 맨 위가 아니라 맨 뒤로 간다', () => {
    const rows = [
      row('수집중', { status: 'collecting', daysLeft: null }),
      row('임박', { status: 'soon', daysLeft: 3 }),
      row('여유', { status: 'ok', daysLeft: 40 }),
    ]
    expect(sortRows(rows, 'soon').map((r) => r.item.name)).toEqual(['임박', '여유', '수집중'])
  })

  it('재고 없음이 가장 급하다', () => {
    const rows = [
      row('임박', { status: 'soon', daysLeft: 2 }),
      row('재고없음', { status: 'outOfStock', daysLeft: null }),
      row('지남', { status: 'soon', daysLeft: -5 }),
    ]
    expect(sortRows(rows, 'soon').map((r) => r.item.name)).toEqual(['재고없음', '지남', '임박'])
  })

  it('남은 일수가 적은 것부터', () => {
    const rows = [row('C', { daysLeft: 30 }), row('A', { daysLeft: 5 }), row('B', { daysLeft: 12 })]
    expect(sortRows(rows, 'soon').map((r) => r.item.name)).toEqual(['A', 'B', 'C'])
  })
})

describe('그 밖의 정렬', () => {
  it('이름순은 한글 순서를 따른다', () => {
    const rows = [row('휴지'), row('가위'), row('세제')]
    expect(sortRows(rows, 'name').map((r) => r.item.name)).toEqual(['가위', '세제', '휴지'])
  })

  it('최근 구매순은 최신이 먼저', () => {
    const rows = [
      row('옛날', { latestDate: '2026-01-01' }),
      row('최근', { latestDate: '2026-08-01' }),
      row('중간', { latestDate: '2026-05-01' }),
    ]
    expect(sortRows(rows, 'recent').map((r) => r.item.name)).toEqual(['최근', '중간', '옛날'])
  })

  it('누적 지출순은 큰 금액이 먼저', () => {
    const rows = [row('싼것', { spent: 3000 }), row('비싼것', { spent: 50000 })]
    expect(sortRows(rows, 'spent').map((r) => r.item.name)).toEqual(['비싼것', '싼것'])
  })

  it('값이 같으면 이름으로 갈린다 — 순서가 흔들리지 않게', () => {
    const rows = [row('나', { spent: 100 }), row('가', { spent: 100 })]
    expect(sortRows(rows, 'spent').map((r) => r.item.name)).toEqual(['가', '나'])
  })
})

describe('필터', () => {
  const rows = [
    row('세탁세제', { category: '생활용품', brand: '아모레', status: 'soon', daysLeft: 3 }),
    row('전기포트', { type: 'oneTime', category: '주방' }),
    row('휴지', { category: '생활용품', status: 'outOfStock', daysLeft: null }),
  ]

  it('타입으로 거른다', () => {
    const found = applyFilters(rows, { ...EMPTY_FILTERS, type: 'oneTime' })
    expect(found.map((r) => r.item.name)).toEqual(['전기포트'])
  })

  it('카테고리로 거른다', () => {
    const found = applyFilters(rows, { ...EMPTY_FILTERS, category: '주방' })
    expect(found.map((r) => r.item.name)).toEqual(['전기포트'])
  })

  it('소진 임박에는 재고 없음도 포함된다', () => {
    const found = applyFilters(rows, { ...EMPTY_FILTERS, soonOnly: true })
    expect(found.map((r) => r.item.name)).toEqual(['세탁세제', '휴지'])
  })

  it('검색은 품목명·카테고리·브랜드를 본다', () => {
    expect(applyFilters(rows, { ...EMPTY_FILTERS, query: '세탁' })[0].item.name).toBe('세탁세제')
    expect(applyFilters(rows, { ...EMPTY_FILTERS, query: '주방' })[0].item.name).toBe('전기포트')
    expect(applyFilters(rows, { ...EMPTY_FILTERS, query: '아모레' })[0].item.name).toBe('세탁세제')
  })

  it('검색어의 공백과 대소문자는 무시한다', () => {
    expect(applyFilters(rows, { ...EMPTY_FILTERS, query: '  휴지  ' })).toHaveLength(1)
    expect(applyFilters(rows, { ...EMPTY_FILTERS, query: '' })).toHaveLength(3)
  })

  it('조건을 겹쳐 쓸 수 있다', () => {
    const found = applyFilters(rows, {
      ...EMPTY_FILTERS,
      type: 'consumable',
      category: '생활용품',
      soonOnly: true,
      query: '휴',
    })
    expect(found.map((r) => r.item.name)).toEqual(['휴지'])
  })

  it('활성 필터 여부를 안다', () => {
    expect(hasActiveFilter(EMPTY_FILTERS)).toBe(false)
    expect(hasActiveFilter({ ...EMPTY_FILTERS, query: ' ' })).toBe(false)
    expect(hasActiveFilter({ ...EMPTY_FILTERS, soonOnly: true })).toBe(true)
  })
})

describe('URL 왕복', () => {
  it('필터와 정렬을 주소에 넣고 되읽는다', () => {
    const filters: Filters = {
      query: '세제',
      type: 'consumable',
      category: '생활용품',
      soonOnly: true,
    }
    const params = paramsFromState(filters, 'name')
    expect(filtersFromParams(params)).toEqual(filters)
    expect(sortFromParams(params)).toBe('name')
  })

  it('기본값은 주소에 넣지 않는다', () => {
    expect(paramsFromState(EMPTY_FILTERS, DEFAULT_SORT).toString()).toBe('')
  })

  it('빈 주소는 기본 상태로 읽힌다', () => {
    const params = new URLSearchParams()
    expect(filtersFromParams(params)).toEqual(EMPTY_FILTERS)
    expect(sortFromParams(params)).toBe(DEFAULT_SORT)
  })

  it('주소에서 온 이상한 값은 기본값으로 되돌린다', () => {
    const params = new URLSearchParams('type=드롭테이블&sort=없는정렬&soon=yes')
    expect(filtersFromParams(params).type).toBe('all')
    expect(filtersFromParams(params).soonOnly).toBe(false)
    expect(sortFromParams(params)).toBe(DEFAULT_SORT)
  })

  it('공백만 있는 검색어는 주소에 남기지 않는다', () => {
    expect(paramsFromState({ ...EMPTY_FILTERS, query: '   ' }, DEFAULT_SORT).toString()).toBe('')
  })
})
