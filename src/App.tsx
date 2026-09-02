import { useEffect, useState } from 'react'
import { formatDate, formatKRW, todayStr } from './lib/format'
import {
  DBError,
  getStorageEstimate,
  itemsRepo,
  purchaseRepo,
  requestPersistentStorage,
} from './lib/db'
import type { Item, Purchase } from './types'

/**
 * Phase 1 확인용 임시 화면. Phase 3에서 라우터 + Home으로 교체한다.
 * 목적: IndexedDB 왕복(쓰기 → 읽기)과 저장소 영속화 상태를 눈으로 확인한다.
 */
export default function App() {
  const [items, setItems] = useState<Item[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function reload() {
    try {
      const [nextItems, nextPurchases] = await Promise.all([itemsRepo.all(), purchaseRepo.all()])
      setItems(nextItems)
      setPurchases(nextPurchases)
      setError(null)
    } catch (e) {
      setError(e instanceof DBError ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void (async () => {
      setPersisted(await requestPersistentStorage())
      setEstimate(await getStorageEstimate())
      await reload()
    })()
  }, [])

  async function addSample() {
    try {
      const item: Item = {
        id: crypto.randomUUID(),
        name: '세탁세제',
        category: '생활용품',
        type: 'consumable',
        createdAt: new Date().toISOString(),
      }
      const purchase: Purchase = {
        id: crypto.randomUUID(),
        itemId: item.id,
        brand: '테스트브랜드',
        volume: 3,
        unit: 'L',
        quantity: 2,
        remaining: 2,
        price: 18000,
        purchaseDate: todayStr(),
        depletionDates: [],
        hasReceipt: false,
      }
      await itemsRepo.put(item)
      await purchaseRepo.put(purchase)
      await reload()
    } catch (e) {
      setError(e instanceof DBError ? e.message : String(e))
    }
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <h1 className="text-lg font-semibold">Phase 1 — 저장소 확인</h1>

      <dl className="mt-4 space-y-1 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-neutral-500">영속 저장소</dt>
          <dd>{persisted === null ? '확인 중' : persisted ? '승인됨' : '거부됨 (백업 필요)'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">사용량</dt>
          <dd className="tabular">
            {estimate
              ? `${(estimate.usage / 1024).toFixed(1)}KB / ${(estimate.quota / 1024 / 1024).toFixed(0)}MB`
              : '알 수 없음'}
          </dd>
        </div>
      </dl>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        onClick={addSample}
        className="mt-4 min-h-11 w-full rounded-xl bg-indigo-600 px-4 font-medium text-white"
      >
        샘플 데이터 추가
      </button>

      {loading ? (
        <p className="mt-4 text-sm text-neutral-500">불러오는 중…</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => {
            const own = purchases.filter((p) => p.itemId === item.id)
            return (
              <li key={item.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-neutral-500">
                  {item.category} · 이력 {own.length}건
                </p>
                {own.map((p) => (
                  <p key={p.id} className="tabular mt-1 text-sm text-neutral-600">
                    {formatDate(p.purchaseDate)} · {formatKRW(p.price)} · 남은 {p.remaining}개
                  </p>
                ))}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
