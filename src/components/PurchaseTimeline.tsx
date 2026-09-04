import { ChevronDown, ChevronUp, Minus, Plus, Trash2, Undo2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { unitPrice } from '../lib/calc'
import { DBError } from '../lib/db'
import { formatDate, formatKRW, formatUnitValue } from '../lib/format'
import { countingUnitOf } from '../lib/units'
import { useData } from '../state/DataContext'
import type { Item, Purchase, Unit } from '../types'
import ConfirmModal from './ConfirmModal'
import { ReceiptThumb } from './ReceiptViewer'
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
  const { deplete, undoDepletion } = useData()
  const toast = useToast()
  const [expanded, setExpanded] = useState(false)
  const [picking, setPicking] = useState(false)
  // G4 — 저장이 끝나기 전 재클릭으로 남은 개수가 두 번 줄어드는 것을 막는다
  const [busy, setBusy] = useState(false)

  const oneTime = item.type === 'oneTime'
  const remaining = purchase.remaining
  const depleted = remaining <= 0
  const price = unitPrice(purchase)
  // 세는 단위. 롤·장은 그 단위 그대로, L·kg는 포장 단위인 '개'로 센다
  const unit = countingUnitOf(purchase.unit)
  const groups = groupByDate(purchase.depletionDates)

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
              <>
                {' · '}
                {formatUnitValue(purchase.volume, purchase.unit)}
                {/* "6롤 × 1"은 6롤을 한 묶음 샀다는 말이라 군더더기다 */}
                {purchase.quantity > 1 && ` × ${purchase.quantity}`}
              </>
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
              depleted ? '소진 완료' : `${remaining}${unit}`
            }
          />
        )}
      </dl>

      {!oneTime && (
        <>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => run(() => deplete(purchase.id), '기록하지 못했어요.')}
              disabled={depleted || busy}
              className={`min-h-11 flex-1 rounded-xl text-sm font-medium ${
                depleted
                  ? 'bg-neutral-100 text-neutral-400'
                  : 'bg-indigo-50 text-indigo-700 active:bg-indigo-100'
              }`}
            >
              {depleted ? '소진 완료' : busy ? '기록 중…' : `1${unit} 사용`}
            </button>

            {/* 남은 게 하나뿐이면 왼쪽 버튼과 같은 동작이라 내보이지 않는다 */}
            {remaining > 1 && (
              <button
                onClick={() => run(() => deplete(purchase.id, remaining), '기록하지 못했어요.')}
                disabled={busy}
                className="min-h-11 shrink-0 rounded-xl border border-neutral-300 px-3 text-sm font-medium text-neutral-700 active:bg-neutral-50 disabled:opacity-60"
              >
                전부 사용
              </button>
            )}
          </div>

          {remaining > 1 && (
            <div className="mt-1">
              <button
                onClick={() => setPicking((v) => !v)}
                aria-expanded={picking}
                className="flex min-h-11 w-full items-center justify-between text-sm text-neutral-500"
              >
                수량 직접 입력
                {picking ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {/* 접으면 언마운트되므로 다시 열 때 수량이 초기값부터 시작한다 */}
              {picking && (
                <AmountPicker
                  unit={unit}
                  max={remaining}
                  busy={busy}
                  onUse={(count) =>
                    run(async () => {
                      await deplete(purchase.id, count)
                      setPicking(false)
                    }, '기록하지 못했어요.')
                  }
                />
              )}
            </div>
          )}

          {groups.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="flex min-h-11 w-full items-center justify-between text-sm text-neutral-500"
              >
                소진 기록 {purchase.depletionDates.length}
                {unit}
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {expanded && (
                <ul className="tabular mt-1 space-y-1 border-t border-neutral-100 pt-2">
                  {groups.map(({ date, count }) => (
                    <li
                      key={date}
                      className="flex items-center justify-between text-sm text-neutral-600"
                    >
                      <span>
                        {formatDate(date)}
                        {count > 1 && ` · ${count}${unit}`}
                      </span>
                      {/* 잘못 누른 기록이 평균에 영구히 남지 않도록 되돌릴 길을 둔다 (G3) */}
                      <button
                        onClick={() =>
                          run(() => undoDepletion(purchase.id, date, count), '되돌리지 못했어요.')
                        }
                        disabled={busy}
                        aria-label={`${formatDate(date)} 소진 기록 ${count}${unit} 되돌리기`}
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

      {purchase.hasReceipt ? (
        <ReceiptThumb purchaseId={purchase.id} />
      ) : (
        <p className="mt-2 text-xs text-neutral-400">영수증 없음</p>
      )}
    </li>
  )
}

/**
 * 한 번에 여러 개를 소진할 때 쓰는 수량 선택기.
 * 남은 것보다 많이 쓸 수는 없으므로 max에서 잘라 낸다.
 */
function AmountPicker({
  unit,
  max,
  busy,
  onUse,
}: {
  unit: Unit
  max: number
  busy: boolean
  onUse: (count: number) => void
}) {
  // 1개는 위 버튼이 이미 맡고 있으니 2부터 시작한다
  const [raw, setRaw] = useState('2')

  // 입력 중에는 빈 칸이나 소수가 스쳐 지나간다. 표시와 저장에 쓰는 값은 항상 정수로 좁힌다
  const parsed = Number(raw)
  const amount = Number.isFinite(parsed) ? Math.min(Math.max(1, Math.floor(parsed)), max) : 1

  return (
    <div className="mt-1 flex items-center gap-2 border-t border-neutral-100 pt-2">
      <div className="flex items-stretch rounded-xl border border-neutral-300">
        <StepButton
          label="수량 하나 줄이기"
          disabled={amount <= 1}
          onClick={() => setRaw(String(amount - 1))}
        >
          <Minus size={16} />
        </StepButton>
        <input
          type="number"
          inputMode="numeric"
          step="1"
          min="1"
          max={max}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          // 빈 칸이나 범위 밖 숫자를 남긴 채 손을 떼면, 버튼 문구와 입력값이 어긋난다
          onBlur={() => setRaw(String(amount))}
          aria-label="사용할 수량"
          className="tabular w-14 border-x border-neutral-300 text-center text-base outline-none"
        />
        <StepButton
          label="수량 하나 늘리기"
          disabled={amount >= max}
          onClick={() => setRaw(String(amount + 1))}
        >
          <Plus size={16} />
        </StepButton>
      </div>

      <button
        onClick={() => onUse(amount)}
        disabled={busy}
        className="min-h-11 flex-1 rounded-xl bg-indigo-50 text-sm font-medium text-indigo-700 active:bg-indigo-100 disabled:opacity-60"
      >
        {busy ? '기록 중…' : `${amount}${unit} 사용`}
      </button>
    </div>
  )
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-11 items-center justify-center text-neutral-600 disabled:text-neutral-300"
    >
      {children}
    </button>
  )
}

/**
 * 소진 기록은 1건이 1개라, 같은 날 3롤을 쓰면 같은 날짜가 세 번 들어 있다.
 * 화면에서는 날짜별로 묶어 "3롤"로 보여준다. 최신순.
 */
function groupByDate(dates: string[]): { date: string; count: number }[] {
  const byDate = new Map<string, number>()
  for (const date of dates) byDate.set(date, (byDate.get(date) ?? 0) + 1)

  return [...byDate.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="truncate text-right text-neutral-800">{value}</dd>
    </div>
  )
}
