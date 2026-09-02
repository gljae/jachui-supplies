import { ChevronLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ConfirmModal from '../components/ConfirmModal'
import EmptyState from '../components/EmptyState'
import FormField, { inputClass } from '../components/FormField'
import PurchaseTimeline from '../components/PurchaseTimeline'
import Sheet from '../components/Sheet'
import Skeleton from '../components/Skeleton'
import StatusBadge, { depletionLabel } from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import {
  avgPurchaseIntervalDays,
  cycleOptions,
  predictDepletion,
  totalRemaining,
  type CycleMode,
} from '../lib/calc'
import { DBError } from '../lib/db'
import { formatDate, formatDays } from '../lib/format'
import { useData } from '../state/DataContext'
import type { Item } from '../types'

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { items, purchasesOf, loading, updateItem, removeItem } = useData()

  const [mode, setMode] = useState<CycleMode>('perUnit')
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const item = items.find((i) => i.id === id)
  const purchases = useMemo(() => (id ? purchasesOf(id) : []), [id, purchasesOf])

  const summary = useMemo(() => {
    if (!item) return null
    return {
      remaining: totalRemaining(purchases),
      interval: avgPurchaseIntervalDays(purchases),
      cycles: cycleOptions(purchases),
      depletion: predictDepletion(purchases, new Date()),
    }
  }, [item, purchases])

  // G8 — 첫 로드가 끝나기 전에는 "없는 물품"이라고 단정하지 않는다
  if (loading) {
    return (
      <main className="space-y-3 p-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </main>
    )
  }

  if (!item || !summary) {
    return (
      <main className="pt-8">
        <EmptyState
          title="물품을 찾을 수 없어요."
          description="이미 삭제되었거나 주소가 잘못되었습니다."
        />
        <div className="px-4">
          <Link
            to="/"
            className="flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 font-medium text-neutral-700"
          >
            홈으로
          </Link>
        </div>
      </main>
    )
  }

  const oneTime = item.type === 'oneTime'
  // 용량 토글과 표준 토글의 라벨이 같으면(대표가 1L 등) 하나만 남긴다
  const visibleCycles = summary.cycles.filter(
    (c, i, all) => c.enabled && all.findIndex((o) => o.enabled && o.label === c.label) === i,
  )
  const active = visibleCycles.find((c) => c.mode === mode) ?? visibleCycles[0]

  async function handleDelete() {
    try {
      await removeItem(item!.id)
      // 삭제 후 이 화면에 남아 있으면 없는 데이터를 읽다 깨진다 (G8)
      navigate('/', { replace: true })
    } catch (error) {
      toast(error instanceof DBError ? error.message : '물품을 삭제하지 못했어요.')
      setConfirming(false)
    }
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-neutral-50/90 backdrop-blur">
        <div className="flex items-center gap-1 px-2 py-2">
          <Link
            to="/"
            aria-label="뒤로"
            className="flex size-11 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100"
          >
            <ChevronLeft size={22} />
          </Link>
          <h1 className="truncate text-lg font-semibold">{item.name}</h1>
        </div>
      </header>

      <main className="space-y-6 px-4 py-4">
        <section className="flex items-center justify-between gap-2">
          <div>
            <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
              {item.category}
            </span>
            {!oneTime && (
              <p className="tabular mt-2 text-2xl font-semibold">
                {summary.remaining.length > 0
                  ? summary.remaining.map((r) => `${r.count}${r.label}`).join(' / ')
                  : '재고 없음'}
              </p>
            )}
          </div>
          {!oneTime && <StatusBadge result={summary.depletion} />}
        </section>

        {!oneTime && (
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-neutral-900">주기</h2>

            <dl className="tabular mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-neutral-500">구매 주기</dt>
                <dd>
                  {summary.interval == null
                    ? '이력 2건부터'
                    : summary.interval < 1
                      ? '1일 미만 (같은 날 함께 구매)'
                      : formatDays(summary.interval)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-neutral-500">예상 소진일</dt>
                <dd>
                  {summary.depletion.expectedDate
                    ? `${formatDate(summary.depletion.expectedDate)} · ${depletionLabel(summary.depletion)}`
                    : depletionLabel(summary.depletion)}
                </dd>
              </div>
            </dl>

            <div className="mt-4 border-t border-neutral-100 pt-3">
              <p className="text-xs text-neutral-500">실사용 주기</p>
              {active?.days != null ? (
                <p className="tabular mt-1 text-lg font-semibold">
                  {active.label} 평균 {formatDays(active.days)}
                </p>
              ) : (
                <p className="mt-1 text-sm text-neutral-500">
                  소진 기록이 쌓이면 계산할 수 있어요.
                </p>
              )}

              {visibleCycles.length > 1 && (
                <div className="mt-3 flex gap-1 rounded-lg bg-neutral-100 p-1">
                  {visibleCycles.map((option) => (
                    <button
                      key={option.mode}
                      onClick={() => setMode(option.mode)}
                      className={`min-h-9 flex-1 rounded-md text-sm font-medium transition ${
                        active?.mode === option.mode
                          ? 'bg-white text-neutral-900 shadow-sm'
                          : 'text-neutral-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">
            구매 이력 {purchases.length}건
          </h2>
          {purchases.length === 0 ? (
            <EmptyState title="이력이 없어요." />
          ) : (
            <PurchaseTimeline
              item={item}
              purchases={purchases}
              onItemEmptied={() => navigate("/", { replace: true })}
            />
          )}
        </section>

        <section className="flex gap-2 pt-2">
          <button
            onClick={() => setEditing(true)}
            className="min-h-11 flex-1 rounded-xl border border-neutral-300 font-medium text-neutral-700"
          >
            품목 수정
          </button>
          <button
            onClick={() => setConfirming(true)}
            className="min-h-11 flex-1 rounded-xl border border-red-200 font-medium text-red-600"
          >
            품목 삭제
          </button>
        </section>
      </main>

      <EditSheet
        open={editing}
        item={item}
        onClose={() => setEditing(false)}
        onSave={updateItem}
      />

      <ConfirmModal
        open={confirming}
        title={`"${item.name}"을(를) 삭제할까요?`}
        message={`구매 이력 ${purchases.length}건과 첨부된 영수증이 모두 함께 지워집니다. 되돌릴 수 없어요.`}
        confirmLabel="모두 삭제"
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}

function EditSheet({
  open,
  item,
  onClose,
  onSave,
}: {
  open: boolean
  item: Item
  onClose: () => void
  onSave: (item: Item) => Promise<void>
}) {
  // Sheet는 닫힐 때 children을 마운트하지 않으므로, 폼 상태는 열 때마다 새로 시작한다.
  // 상태를 이 바깥에 두면 취소하고 다시 열었을 때 이전 입력이 남는다.
  return (
    <Sheet open={open} title="품목 수정" onClose={onClose}>
      <EditForm item={item} onClose={onClose} onSave={onSave} />
    </Sheet>
  )
}

function EditForm({
  item,
  onClose,
  onSave,
}: {
  item: Item
  onClose: () => void
  onSave: (item: Item) => Promise<void>
}) {
  const toast = useToast()
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState(item.category)
  const [errors, setErrors] = useState<{ name?: string; category?: string }>({})
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const next: { name?: string; category?: string } = {}
    if (!name.trim()) next.name = '품목명을 입력해 주세요.'
    if (!category.trim()) next.category = '카테고리를 입력해 주세요.'
    if (Object.keys(next).length > 0) return setErrors(next)

    setSaving(true)
    try {
      await onSave({ ...item, name: name.trim(), category: category.trim() })
      onClose()
    } catch (e) {
      const message = e instanceof DBError ? e.message : '저장하지 못했어요.'
      setErrors({ name: message })
      toast(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <FormField label="품목명" required error={errors.name}>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setErrors((p) => ({ ...p, name: undefined }))
          }}
          className={inputClass}
        />
      </FormField>
      <FormField label="카테고리" required error={errors.category}>
        <input
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            setErrors((p) => ({ ...p, category: undefined }))
          }}
          className={inputClass}
        />
      </FormField>
      <p className="text-sm text-neutral-500">
        타입(소모품/일회성)은 이미 쌓인 이력과 어긋날 수 있어 바꿀 수 없어요.
      </p>
      <button
        onClick={handleSave}
        disabled={saving}
        className="min-h-12 w-full rounded-xl bg-indigo-600 font-medium text-white disabled:opacity-60"
      >
        {saving ? '저장 중…' : '저장'}
      </button>
    </div>
  )
}
