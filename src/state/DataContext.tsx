import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useToast } from '../components/Toast'
import {
  DBError,
  deleteItemCascade,
  deletePurchaseCascade,
  itemsRepo,
  purchaseRepo,
  putItemWithPurchase,
  requestPersistentStorage,
} from '../lib/db'
import { todayStr } from '../lib/format'
import { totalUnitsOf } from '../lib/units'
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
  /** 압축까지 끝난 영수증. 첨부하지 않았거나 처리에 실패했으면 없다 */
  receipt?: { blob: Blob; mimeType: string; size: number }
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
  /** 저장소를 직접 바꾼 뒤(복원·초기화) 화면 갱신과 다른 탭 알림을 함께 한다 */
  commit: () => Promise<void>
  addEntry: (entry: NewEntry) => Promise<void>
  /** "N개 사용" — 남은 개수를 그만큼 줄이고 오늘을 소진일로 그 수만큼 기록한다 */
  deplete: (purchaseId: string, count?: number) => Promise<void>
  /** 잘못 누른 소진 기록을 되돌린다. 같은 날 여러 개를 썼으면 count로 한 번에 되돌린다 */
  undoDepletion: (purchaseId: string, date: string, count?: number) => Promise<void>
  updateItem: (item: Item) => Promise<void>
  removePurchase: (purchaseId: string) => Promise<void>
  removeItem: (itemId: string) => Promise<void>
}

const CHANNEL = 'jachui-supplies'

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
   * G2 — 다른 탭이 데이터를 바꾸면 이 탭의 메모리 캐시는 그대로다.
   * 한쪽에서 지운 품목이 다른 탭에는 계속 보이고, 그걸 누르면 없는 데이터를 읽는다.
   * 변경 사실만 주고받고 각 탭이 스스로 다시 읽는다.
   */
  const channel = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bus = new BroadcastChannel(CHANNEL)
    bus.onmessage = () => void reload()
    channel.current = bus
    return () => {
      bus.close()
      channel.current = null
    }
  }, [reload])

  /** 변경 후 내 화면을 갱신하고 다른 탭에도 알린다 */
  const commit = useCallback(async () => {
    await reload()
    channel.current?.postMessage('changed')
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
      const volume = item.type === 'oneTime' ? undefined : entry.volume
      const unit = item.type === 'oneTime' ? undefined : entry.unit

      const purchase: Purchase = {
        id: crypto.randomUUID(),
        itemId: item.id,
        brand: entry.brand?.trim() || undefined,
        volume,
        unit,
        quantity,
        // 남은 개수는 셈 단위로 센다. 6롤짜리 1팩은 1이 아니라 6에서 시작한다
        remaining: totalUnitsOf({ volume, unit, quantity }),
        price: entry.price,
        purchaseDate: entry.purchaseDate,
        depletionDates: [],
        hasReceipt: entry.receipt != null,
      }

      await putItemWithPurchase(
        item,
        purchase,
        entry.receipt ? { purchaseId: purchase.id, ...entry.receipt } : undefined,
      )
      await commit()
    },
    [items, commit],
  )

  /**
   * 소진 기록. 한 번에 여러 개를 써도 같은 날짜를 그 수만큼 넣어 1건 = 1개를 지킨다.
   *
   * G4 — 절대 제자리에서 고치지 않는다.
   * depletionDates.push()로 배열을 직접 건드리면 참조가 그대로라 리렌더가 일어나지 않고,
   * 메모리 캐시와 DB가 서로 어긋난 채 남는다. 항상 새 객체를 만들어 저장한다.
   */
  const deplete = useCallback(
    async (purchaseId: string, count = 1) => {
      const target = purchases.find((p) => p.id === purchaseId)
      if (!target || target.remaining <= 0) return

      // 남은 것보다 많이 쓸 수는 없다. 소수나 NaN이 들어와도 최소 1개는 되게 맞춘다
      const requested = Number.isFinite(count) ? Math.floor(count) : 1
      const used = Math.min(Math.max(1, requested), target.remaining)
      const today = todayStr()

      const next: Purchase = {
        ...target,
        remaining: target.remaining - used,
        depletionDates: [...target.depletionDates, ...Array<string>(used).fill(today)].sort(),
      }
      await purchaseRepo.put(next)
      await commit()
    },
    [purchases, commit],
  )

  const undoDepletion = useCallback(
    async (purchaseId: string, date: string, count = 1) => {
      const target = purchases.find((p) => p.id === purchaseId)
      if (!target) return

      const dates = [...target.depletionDates]
      let removed = 0
      // 같은 날짜가 여러 번 들어 있을 수 있다. 요청한 수만큼만 걷어낸다
      for (let i = 0; i < count; i++) {
        const index = dates.indexOf(date)
        if (index < 0) break
        dates.splice(index, 1)
        removed++
      }
      if (removed === 0) return

      const next: Purchase = {
        ...target,
        depletionDates: dates,
        // 되돌린 개수가 총 개수를 넘지 않게 막는다
        remaining: Math.min(totalUnitsOf(target), target.remaining + removed),
      }
      await purchaseRepo.put(next)
      await commit()
    },
    [purchases, commit],
  )

  const updateItem = useCallback(
    async (item: Item) => {
      await itemsRepo.put(item)
      await commit()
    },
    [commit],
  )

  const removePurchase = useCallback(
    async (purchaseId: string) => {
      await deletePurchaseCascade(purchaseId)
      await commit()
    },
    [commit],
  )

  const removeItem = useCallback(
    async (itemId: string) => {
      await deleteItemCascade(itemId)
      await commit()
    },
    [commit],
  )

  const purchasesOf = useCallback(
    (itemId: string) => purchases.filter((p) => p.itemId === itemId),
    [purchases],
  )

  const value = useMemo(
    () => ({
      items,
      purchases,
      loading,
      persisted,
      purchasesOf,
      reload,
      commit,
      addEntry,
      deplete,
      undoDepletion,
      updateItem,
      removePurchase,
      removeItem,
    }),
    [
      items,
      purchases,
      loading,
      persisted,
      purchasesOf,
      reload,
      commit,
      addEntry,
      deplete,
      undoDepletion,
      updateItem,
      removePurchase,
      removeItem,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const value = useContext(DataContext)
  if (!value) throw new Error('useData는 DataProvider 안에서만 쓸 수 있습니다.')
  return value
}
