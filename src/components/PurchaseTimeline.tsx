import { ChevronDown, ChevronUp, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { unitPrice } from '../lib/calc'
import { DBError } from '../lib/db'
import { formatDate, formatKRW, formatUnitValue } from '../lib/format'
import { countingUnitOf } from '../lib/units'
import { useData } from '../state/DataContext'
import type { Item, Purchase } from '../types'
import ConfirmModal from './ConfirmModal'
import { useToast } from './Toast'

export default function PurchaseTimeline({
  item,
  purchases,
  onItemEmptied,
}: {
  item: Item
  purchases: Purchase[]
  /** 마지막 이력을 지워 품목까지 사라졌을 때 (상세 화면을 떠나야 한다) */
  onItemEmptied: () => void
}) {
  const [pendingDelete, setPendingDelete] = useState<Purchase | null>(null)
  const { removePurchase, removeItem } = useData()
  const toast = useToast()

  // 최신순. 같은 날짜면 0을 돌려줘야 한다 — 그러지 않으면 compare(a,b)와 compare(b,a)가
  // 둘 다 -1이 되어 비교자 계약을 깨고, 같은 날 구매한 이력들의 순서가 정의되지 않는다
  const sorted = [...purchases].sort((a, b) =>
    a.purchaseDate === b.purchaseDate ? 0 : a.purchaseDate < b.purchaseDate ? 1 : -1,
  )

  // 마지막 한 건을 지우면 이력 0건짜리 품목이 남는다. 그 상태는 아무것도 할 수 없는
  // 막다른 길이라, 품목까지 함께 지우고 모달 문구로 미리 알린다.
  const isLastOne = purchases.length === 1

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      if (isLastOne) {
        await removeItem(item.id)
        setPendingDelete(null)
        onItemEmptied()
        return
      }
      await removePurchase(pendingDelete.id)
      setPendingDelete(null)
    } catch (error) {
      toast(error instanceof DBError ? error.message : '이력을 삭제하지 못했어요.')
    }
  }

  return (
    <>
      <ul className="space-y-3">
        {sorted.map((purchase) => (
          <Entry
            key={purchase.id}
            item={item}
            purchase={purchase}
            onDelete={() => setPendingDelete(purchase)}
          />
        ))}
      </ul>

      <ConfirmModal
        open={pendingDelete != null}
        title={isLastOne ? `"${item.name}"이 함께 사라져요` : '이 이력을 삭제할까요?'}
        message={
          pendingDelete
            ? isLastOne
              ? `마지막 남은 이력입니다. 이걸 지우면 "${item.name}" 품목도 함께 사라집니다. 되돌릴 수 없어요.`
              : `${formatDate(pendingDelete.purchaseDate)} · ${formatKRW(pendingDelete.price)} 기록과 첨부된 영수증이 함께 지워집니다. 되돌릴 수 없어요.`
            : ''
        }
        confirmLabel={isLastOne ? '품목까지 삭제' : '삭제'}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  )
}

function Entry({
  item,
  purchase,
  onDelete,
}: {
  item: Item
  purchase: Purchase
  onDelete: () => void
}) {
  const { depleteOne, undoDepletion } = useData()
  const toast = useToast()
  const [expanded, setExpanded] = useState(false)
  // G4 — 저장이 끝나기 전 재클릭으로 남은 개수가 두 번 줄어드는 것을 막는다
  const [busy, setBusy] = useState(false)

  const oneTime = item.type === 'oneTime'
  const depleted = purchase.remaining <= 0
  const price = unitPrice(purchase)

  async function run(action: () => Promise<void>, fallback: string) {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } catch (error) {
      toast(error instanceof DBError ? error.message : fallback)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-neutral-900">
            {purchase.brand || (oneTime ? item.name : '브랜드 없음')}
          </p>
          <p className="tabular mt-0.5 text-sm text-neutral-500">
            {formatDate(purchase.purchaseDate)}
            {!oneTime && purchase.volume != null && purchase.unit && (
              <> · {formatUnitValue(purchase.volume, purchase.unit)} × {purchase.quantity}</>
            )}
          </p>
        </div>
        <button
          onClick={onDelete}
          aria-label="이력 삭제"
          className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-red-600"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <dl className="tabular mt-3 space-y-1 text-sm">
        <Row label="가격" value={formatKRW(purchase.price)} />
        {price && (
          <Row label="단위당" value={`${formatKRW(price.value)} / 1${price.unit}`} />
        )}
        {!oneTime && (
          <Row
            label="남은 개수"
            value={
              // 헤더가 "3롤"인데 여기만 "1개"라고 하면 안 된다. 세는 단위를 A9와 똑같이 맞춘다
              depleted ? '소진 완료' : `${purchase.remaining}${countingUnitOf(purchase.unit)}`
            }
          />
        )}
      </dl>

      {!oneTime && (
        <>
          <button
            onClick={() => run(() => depleteOne(purchase.id), '기록하지 못했어요.')}
            disabled={depleted || busy}
            className={`mt-3 min-h-11 w-full rounded-xl text-sm font-medium ${
              depleted
                ? 'bg-neutral-100 text-neutral-400'
                : 'bg-indigo-50 text-indigo-700 active:bg-indigo-100'
            }`}
          >
            {depleted ? '소진 완료' : busy ? '기록 중…' : '1개 다 썼음'}
          </button>

          {purchase.depletionDates.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="flex min-h-11 w-full items-center justify-between text-sm text-neutral-500"
              >
                소진 기록 {purchase.depletionDates.length}건
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {expanded && (
                <ul className="tabular mt-1 space-y-1 border-t border-neutral-100 pt-2">
                  {[...purchase.depletionDates].reverse().map((date, i) => (
                    <li
                      key={`${date}-${i}`}
                      className="flex items-center justify-between text-sm text-neutral-600"
                    >
                      {formatDate(date)}
                      {/* 잘못 누른 기록이 평균에 영구히 남지 않도록 되돌릴 길을 둔다 (G3) */}
                      <button
                        onClick={() =>
                          run(() => undoDepletion(purchase.id, date), '되돌리지 못했어요.')
                        }
                        disabled={busy}
                        aria-label={`${formatDate(date)} 소진 기록 되돌리기`}
                        className="flex size-11 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                      >
                        <Undo2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {/* Phase 6에서 썸네일로 바뀐다 */}
      {!purchase.hasReceipt && <p className="mt-2 text-xs text-neutral-400">영수증 없음</p>}
    </li>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="truncate text-right text-neutral-800">{value}</dd>
    </div>
  )
}

