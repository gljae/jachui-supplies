import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useToast } from '../components/Toast'
import { DBError, itemsRepo, purchaseRepo, requestPersistentStorage } from '../lib/db'
import type { Item, ItemType, Purchase, Unit } from '../types'

export interface NewEntry {
  name: string
  category: string
  type: ItemType
  brand?: string
  volume?: number
  unit?: Unit
  quantity: number
  price: number
  purchaseDate: string
}

interface DataValue {
  items: Item[]
  purchases: Purchase[]
  /** 첫 로드가 끝났는가. "불러오는 중"과 "데이터 없음"을 구분하기 위해 필요하다 (G8) */
  loading: boolean
  /** 자동 삭제 면제 승인 여부. null이면 아직 확인 전 (G2) */
  persisted: boolean | null
  purchasesOf: (itemId: string) => Purchase[]
  reload: () => Promise<void>
  addEntry: (entry: NewEntry) => Promise<void>
}

const DataContext = createContext<DataValue | null>(null)

/**
 * A6 — items/purchases 전량을 메모리에 두고, 변경 후에는 DB에서 다시 읽는다.
 * 영수증 Blob은 여기 담지 않는다. 목록 조회가 느려지기 때문이다.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  const reload = useCallback(async () => {
    try {
      const [nextItems, nextPurchases] = await Promise.all([itemsRepo.all(), purchaseRepo.all()])
      setItems(nextItems)
      setPurchases(nextPurchases)
    } catch (error) {
      toast(error instanceof DBError ? error.message : '데이터를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void (async () => {
      setPersisted(await requestPersistentStorage())
      await reload()
    })()
  }, [reload])

  /**
   * 이름이 같은 품목이 이미 있으면 그 품목의 이력으로 붙인다.
   * 브랜드나 용량이 달라도 같은 품목으로 묶는다 (SPEC 3-2).
   */
  const addEntry = useCallback(
    async (entry: NewEntry) => {
      const name = entry.name.trim()
      const existing = items.find((i) => i.name === name)

      const item: Item = existing ?? {
        id: crypto.randomUUID(),
        name,
        category: entry.category.trim(),
        type: entry.type,
        createdAt: new Date().toISOString(),
      }

      // A10 — 일회성은 재고 개념이 없다. 수량을 1로 고정하고 소진 이력도 남기지 않는다.
      const quantity = item.type === 'oneTime' ? 1 : entry.quantity

      const purchase: Purchase = {
        id: crypto.randomUUID(),
        itemId: item.id,
        brand: entry.brand?.trim() || undefined,
        volume: item.type === 'oneTime' ? undefined : entry.volume,
        unit: item.type === 'oneTime' ? undefined : entry.unit,
        quantity,
        remaining: quantity,
        price: entry.price,
        purchaseDate: entry.purchaseDate,
        depletionDates: [],
        hasReceipt: false,
      }

      if (!existing) await itemsRepo.put(item)
      await purchaseRepo.put(purchase)
      await reload()
    },
    [items, reload],
  )

  const purchasesOf = useCallback(
    (itemId: string) => purchases.filter((p) => p.itemId === itemId),
    [purchases],
  )

  const value = useMemo(
    () => ({ items, purchases, loading, persisted, purchasesOf, reload, addEntry }),
    [items, purchases, loading, persisted, purchasesOf, reload, addEntry],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const value = useContext(DataContext)
  if (!value) throw new Error('useData는 DataProvider 안에서만 쓸 수 있습니다.')
  return value
}
