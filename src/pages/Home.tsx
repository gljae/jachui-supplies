import { Package, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState'
import ItemCard, { cardStats } from '../components/ItemCard'
import ItemForm from '../components/ItemForm'
import Sheet from '../components/Sheet'
import { CardSkeleton } from '../components/Skeleton'
import { useData } from '../state/DataContext'

export default function Home() {
  const { items, purchases, loading } = useData()
  const [sheetOpen, setSheetOpen] = useState(false)

  // 파생값은 한 번만 계산해 카드와 (Phase 7의) 정렬이 같이 쓴다
  const rows = useMemo(() => {
    const today = new Date()
    return items
      .map((item) => {
        const own = purchases.filter((p) => p.itemId === item.id)
        return { item, purchases: own, stats: cardStats(own, today) }
      })
      .sort((a, b) => a.item.name.localeCompare(b.item.name, 'ko'))
  }, [items, purchases])

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-neutral-50/90 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold">자취 생활용품</h1>
      </header>

      <main className="px-4 py-4">
        {/* G8 — 첫 로드가 끝나기 전에는 "없음"이라고 말하지 않는다 */}
        {loading ? (
          <ul className="space-y-3">
            <li>
              <CardSkeleton />
            </li>
            <li>
              <CardSkeleton />
            </li>
          </ul>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Package size={40} strokeWidth={1.5} />}
            title="아직 기록한 물품이 없어요."
            description="+ 버튼으로 첫 물품을 등록해보세요."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map(({ item, purchases: own, stats }) => (
              <ItemCard key={item.id} item={item} purchases={own} stats={stats} />
            ))}
          </ul>
        )}
      </main>

      <button
        onClick={() => setSheetOpen(true)}
        aria-label="물품 추가"
        // G10 — 하단 탭바(56px) + safe-area 위에 뜨도록 띄운다
        className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex size-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg active:bg-indigo-700"
      >
        <Plus size={26} />
      </button>

      <Sheet open={sheetOpen} title="물품 추가" onClose={() => setSheetOpen(false)}>
        <ItemForm onDone={() => setSheetOpen(false)} />
      </Sheet>
    </>
  )
}
