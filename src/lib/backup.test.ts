import { describe, expect, it } from 'vitest'
import {
  BACKUP_SCHEMA,
  BACKUP_VERSION,
  decodeBase64,
  encodeBase64,
  parseBackup,
  remapForMerge,
} from './backup'

function file(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: '2026-09-03T00:00:00.000Z',
    includeReceipts: false,
    items: [
      { id: 'i1', name: '세탁세제', category: '생활용품', type: 'consumable', createdAt: 'x' },
    ],
    purchases: [
      {
        id: 'p1',
        itemId: 'i1',
        brand: '아모레',
        volume: 3,
        unit: 'L',
        quantity: 2,
        remaining: 1,
        price: 18000,
        purchaseDate: '2026-06-01',
        depletionDates: ['2026-07-01'],
        hasReceipt: false,
      },
    ],
    receipts: [],
    ...over,
  })
}

describe('G9 — base64', () => {
  it('큰 배열도 스택을 넘기지 않고 왕복한다', () => {
    // btoa(String.fromCharCode(...bytes))로 한 번에 하면 여기서 터진다
    const bytes = new Uint8Array(600_000)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256

    const encoded = encodeBase64(bytes.buffer)
    const decoded = decodeBase64(encoded)

    expect(decoded.length).toBe(bytes.length)
    expect(decoded[0]).toBe(0)
    expect(decoded[255]).toBe(255)
    expect(decoded[599_999]).toBe(bytes[599_999])
  })

  it('빈 데이터도 처리한다', () => {
    expect(decodeBase64(encodeBase64(new Uint8Array(0).buffer)).length).toBe(0)
  })
})

describe('파일 거절', () => {
  it('JSON이 아니면 거절한다', () => {
    const result = parseBackup('이건 그냥 글자')
    expect(result.ok).toBe(false)
  })

  it('다른 앱의 파일은 거절한다', () => {
    const result = parseBackup(JSON.stringify({ schema: 'other', version: 1 }))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.message).toContain('내보낸 파일이 아니에요')
  })

  it('버전이 다르면 거절한다', () => {
    const result = parseBackup(file({ version: 99 }))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.message).toContain('버전')
  })

  it('items나 purchases가 배열이 아니면 거절한다', () => {
    expect(parseBackup(file({ items: 'nope' })).ok).toBe(false)
    expect(parseBackup(file({ purchases: null })).ok).toBe(false)
  })
})

describe('행 단위 검증', () => {
  it('정상 파일을 읽는다', () => {
    const result = parseBackup(file())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.parsed.data.items).toHaveLength(1)
    expect(result.parsed.data.purchases[0].price).toBe(18000)
    expect(result.parsed.skipped).toEqual({ items: 0, purchases: 0, receipts: 0 })
  })

  it('G3 — 용량이나 수량이 0 이하인 이력은 버린다', () => {
    const base = JSON.parse(file())
    const bad = {
      ...base,
      purchases: [
        base.purchases[0],
        { ...base.purchases[0], id: 'p2', volume: 0 },
        { ...base.purchases[0], id: 'p3', quantity: 0 },
        { ...base.purchases[0], id: 'p4', price: -100 },
      ],
    }
    const result = parseBackup(JSON.stringify(bad))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.parsed.data.purchases.map((p) => p.id)).toEqual(['p1'])
    expect(result.parsed.skipped.purchases).toBe(3)
  })

  it('품목이 없는 고아 이력은 버린다', () => {
    const base = JSON.parse(file())
    base.purchases.push({ ...base.purchases[0], id: 'orphan', itemId: '없는품목' })
    const result = parseBackup(JSON.stringify(base))
    if (!result.ok) return
    expect(result.parsed.data.purchases.map((p) => p.id)).toEqual(['p1'])
    expect(result.parsed.skipped.purchases).toBe(1)
  })

  it('알 수 없는 단위나 타입은 버린다', () => {
    const base = JSON.parse(file())
    base.items.push({ id: 'i2', name: 'x', category: 'y', type: '이상한타입' })
    base.purchases.push({ ...base.purchases[0], id: 'p9', unit: '되', volume: 1 })
    const result = parseBackup(JSON.stringify(base))
    if (!result.ok) return
    expect(result.parsed.skipped.items).toBe(1)
    expect(result.parsed.skipped.purchases).toBe(1)
  })

  it('날짜 형식이 어긋난 이력은 버리고, 소진일은 걸러 정렬한다', () => {
    const base = JSON.parse(file())
    base.purchases[0].depletionDates = ['2026-08-01', 'not-a-date', '2026-07-01']
    base.purchases.push({ ...base.purchases[0], id: 'p5', purchaseDate: '2026/06/01' })
    const result = parseBackup(JSON.stringify(base))
    if (!result.ok) return
    expect(result.parsed.data.purchases[0].depletionDates).toEqual(['2026-07-01', '2026-08-01'])
    expect(result.parsed.skipped.purchases).toBe(1)
  })

  it('remaining이 구매 개수를 넘으면 잘라낸다', () => {
    const base = JSON.parse(file())
    base.purchases[0].remaining = 99
    const result = parseBackup(JSON.stringify(base))
    if (!result.ok) return
    expect(result.parsed.data.purchases[0].remaining).toBe(2)
  })

  it('영수증이 없으면 hasReceipt를 내린다', () => {
    const base = JSON.parse(file())
    base.purchases[0].hasReceipt = true
    const result = parseBackup(JSON.stringify(base))
    if (!result.ok) return
    // 있지도 않은 이미지를 읽으려 들면 상세 화면에서 에러가 뜬다
    expect(result.parsed.data.purchases[0].hasReceipt).toBe(false)
  })

  it('이력이 없는 영수증은 버린다', () => {
    const base = JSON.parse(file())
    base.receipts = [{ purchaseId: '없는이력', mimeType: 'image/jpeg', size: 10, data: 'AAAA' }]
    const result = parseBackup(JSON.stringify(base))
    if (!result.ok) return
    expect(result.parsed.data.receipts).toHaveLength(0)
    expect(result.parsed.skipped.receipts).toBe(1)
  })
})

describe('A19 — 합치기 id 재발급', () => {
  const data = {
    items: [
      { id: 'i1', name: 'a', category: 'c', type: 'consumable' as const, createdAt: 'x' },
      { id: 'i2', name: 'b', category: 'c', type: 'consumable' as const, createdAt: 'x' },
    ],
    purchases: [
      {
        id: 'p1',
        itemId: 'i1',
        quantity: 1,
        remaining: 1,
        price: 1,
        purchaseDate: '2026-01-01',
        depletionDates: [],
        hasReceipt: true,
      },
    ],
    receipts: [{ purchaseId: 'p1', mimeType: 'image/jpeg', size: 1, data: 'AA' }],
  }

  it('겹치는 id만 새로 발급하고 참조를 따라 고친다', () => {
    let n = 0
    const result = remapForMerge(
      data,
      { itemIds: new Set(['i1']), purchaseIds: new Set(['p1']) },
      () => `new-${++n}`,
    )

    expect(result.items.map((i) => i.id)).toEqual(['new-1', 'i2'])
    expect(result.purchases[0].id).toBe('new-2')
    // 참조가 새 id를 가리켜야 한다
    expect(result.purchases[0].itemId).toBe('new-1')
    expect(result.receipts[0].purchaseId).toBe('new-2')
  })

  it('겹치지 않으면 id를 그대로 둔다', () => {
    const result = remapForMerge(
      data,
      { itemIds: new Set(), purchaseIds: new Set() },
      () => 'should-not-be-used',
    )
    expect(result.items.map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(result.purchases[0].itemId).toBe('i1')
    expect(result.receipts[0].purchaseId).toBe('p1')
  })

  it('원본을 건드리지 않는다', () => {
    remapForMerge(data, { itemIds: new Set(['i1']), purchaseIds: new Set(['p1']) }, () => 'x')
    expect(data.items[0].id).toBe('i1')
    expect(data.purchases[0].itemId).toBe('i1')
  })
})
