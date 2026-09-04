export type UnitGroup = 'volume' | 'weight' | 'count'

export type Unit = 'ml' | 'L' | 'g' | 'kg' | '개' | '롤' | '장' | '팩'

export type ItemType = 'oneTime' | 'consumable'

export interface Item {
  id: string
  name: string
  category: string
  type: ItemType
  createdAt: string // ISO
}

export interface Purchase {
  id: string
  itemId: string
  brand?: string
  /**
   * 포장 1개당 용량. 일회성은 없음.
   * count 단위(개·롤·장·팩)에서는 이 값이 곧 낱개 수다 — "6롤짜리 1팩"이면 6.
   */
  volume?: number
  unit?: Unit
  /** 구매한 포장 개수 */
  quantity: number
  /**
   * 남은 개수. 세는 단위는 units.ts의 countingUnitOf를 따른다.
   * 롤·장처럼 낱개로 쓰는 단위는 낱개로(6롤짜리 1팩 = 6), L·kg는 포장 개수로 센다(3L 2통 = 2).
   * 총량은 units.ts의 totalUnitsOf, 곧 quantity × unitsPerPack이다.
   */
  remaining: number
  /** 총액 */
  price: number
  /** yyyy-MM-dd (로컬 날짜) — G1 참조 */
  purchaseDate: string
  /**
   * 소진을 기록한 날짜들. 한 항목이 셈 단위 1개다 — 한 번에 3롤을 쓰면 같은 날짜가 세 번 들어간다.
   * yyyy-MM-dd, 항상 오름차순.
   */
  depletionDates: string[]
  hasReceipt: boolean
}

export interface Receipt {
  purchaseId: string
  blob: Blob
  mimeType: string
  size: number
}
