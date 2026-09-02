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
  /** 1개당 용량. 일회성은 없음 */
  volume?: number
  unit?: Unit
  /** 구매 개수 */
  quantity: number
  /** 남은 개수 */
  remaining: number
  /** 총액 */
  price: number
  /** yyyy-MM-dd (로컬 날짜) — G1 참조 */
  purchaseDate: string
  /** "1개 다 썼음"을 누른 날짜들. yyyy-MM-dd, 항상 오름차순 */
  depletionDates: string[]
  hasReceipt: boolean
}

export interface Receipt {
  purchaseId: string
  blob: Blob
  mimeType: string
  size: number
}
