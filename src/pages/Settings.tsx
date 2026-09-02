import { AlertTriangle, Download, ShieldCheck, Smartphone, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ConfirmModal from '../components/ConfirmModal'
import { useToast } from '../components/Toast'
import {
  BACKUP_SCHEMA,
  BACKUP_VERSION,
  decodeBase64,
  encodeBase64,
  parseBackup,
  remapForMerge,
  type BackupFile,
  type ParsedBackup,
} from '../lib/backup'
import {
  clearAll,
  DBError,
  getStorageEstimate,
  itemsRepo,
  purchaseRepo,
  receiptRepo,
  restoreBackup,
} from '../lib/db'
import { todayStr } from '../lib/format'
import { formatBytes } from '../lib/receipt'
import { useData } from '../state/DataContext'
import { useInstall } from '../state/useInstall'

type Mode = 'overwrite' | 'merge'

export default function Settings() {
  const { items, purchases, persisted, commit } = useData()
  const toast = useToast()

  const [includeReceipts, setIncludeReceipts] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<ParsedBackup | null>(null)
  const [mode, setMode] = useState<Mode>('merge')
  const [resetting, setResetting] = useState(false)
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void getStorageEstimate().then(setEstimate)
  }, [items, purchases])

  async function handleExport() {
    setBusy('내보내는 중…')
    try {
      const [allItems, allPurchases] = await Promise.all([itemsRepo.all(), purchaseRepo.all()])
      const receipts = includeReceipts ? await receiptRepo.all() : []

      const file: BackupFile = {
        schema: BACKUP_SCHEMA,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        includeReceipts,
        items: allItems,
        purchases: includeReceipts
          ? allPurchases
          : // 영수증을 뺐으면 플래그도 내려야 한다. 그러지 않으면 복원한 쪽에서
            // 있지도 않은 이미지를 계속 읽으려 든다
            allPurchases.map((p) => ({ ...p, hasReceipt: false })),
        receipts: await Promise.all(
          receipts.map(async (r) => ({
            purchaseId: r.purchaseId,
            mimeType: r.mimeType,
            size: r.size,
            data: encodeBase64(await r.blob.arrayBuffer()),
          })),
        ),
      }

      const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `jachui-supplies-${todayStr()}.json`
      link.click()
      // 즉시 해제하면 일부 브라우저에서 다운로드가 취소된다
      setTimeout(() => URL.revokeObjectURL(url), 10_000)

      toast(`내보냈어요 · ${formatBytes(blob.size)}`, 'info')
    } catch (error) {
      toast(error instanceof DBError ? error.message : '내보내지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  async function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setBusy('파일을 읽는 중…')
    try {
      const result = parseBackup(await file.text())
      if (!result.ok) {
        toast(result.message)
        return
      }
      // 파일을 새로 고를 때마다 안전한 쪽으로 되돌린다.
      // 지난번에 덮어쓰기를 골랐다고 이번에도 그게 기본이면, 합칠 생각이던 사람이
      // 버튼 하나 잘못 눌러 가진 데이터를 전부 잃는다
      setMode('merge')
      // 저장소는 아직 건드리지 않는다. 무엇이 들어오는지 보여주고 나서 실행한다
      setPending(result.parsed)
    } catch {
      toast('파일을 읽지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  async function handleImport() {
    if (!pending) return
    setBusy('복원하는 중…')
    try {
      let payload = pending.data
      if (mode === 'merge') {
        const [existingItems, existingPurchases] = await Promise.all([
          itemsRepo.all(),
          purchaseRepo.all(),
        ])
        const remapped = remapForMerge(
          pending.data,
          {
            itemIds: new Set(existingItems.map((i) => i.id)),
            purchaseIds: new Set(existingPurchases.map((p) => p.id)),
          },
          () => crypto.randomUUID(),
        )
        payload = { ...pending.data, ...remapped }
      }

      await restoreBackup(mode, {
        items: payload.items,
        purchases: payload.purchases,
        receipts: payload.receipts.map((r) => ({
          purchaseId: r.purchaseId,
          mimeType: r.mimeType,
          size: r.size,
          blob: new Blob([decodeBase64(r.data).buffer as ArrayBuffer], { type: r.mimeType }),
        })),
      })

      await commit()
      setPending(null)
      toast(
        `복원했어요 · 품목 ${payload.items.length}개, 이력 ${payload.purchases.length}건`,
        'info',
      )
    } catch (error) {
      toast(error instanceof DBError ? error.message : '복원하지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  async function handleReset() {
    try {
      await clearAll()
      await commit()
      setResetting(false)
      toast('전체 데이터를 지웠어요.', 'info')
    } catch (error) {
      toast(error instanceof DBError ? error.message : '초기화하지 못했어요.')
    }
  }

  const skippedTotal = pending
    ? pending.skipped.items + pending.skipped.purchases + pending.skipped.receipts
    : 0

  return (
    <>
      <header className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
        <h1 className="text-lg font-semibold">설정</h1>
      </header>

      <main className="space-y-4 px-4 py-4">
        <StorageBanner persisted={persisted} estimate={estimate} />

        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="font-semibold text-neutral-900">내보내기</h2>
          <p className="mt-1 text-sm text-neutral-500">
            품목 {items.length}개, 이력 {purchases.length}건을 JSON 파일로 저장해요.
          </p>

          <label className="mt-3 flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={includeReceipts}
              onChange={(e) => setIncludeReceipts(e.target.checked)}
              className="size-5 accent-indigo-600"
            />
            <span className="text-sm text-neutral-700">
              영수증 이미지 포함
              <span className="block text-xs text-neutral-400">
                파일이 크게 늘어나요. 기본은 제외예요.
              </span>
            </span>
          </label>

          <button
            onClick={handleExport}
            disabled={busy != null}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-medium text-white disabled:opacity-60"
          >
            <Download size={18} />
            {busy === '내보내는 중…' ? busy : '내보내기'}
          </button>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="font-semibold text-neutral-900">가져오기</h2>
          <p className="mt-1 text-sm text-neutral-500">
            내보내기로 만든 파일을 골라 복원해요. 파일을 확인한 뒤 실행 방식을 고를 수 있어요.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={handlePick}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy != null}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 font-medium text-neutral-700 disabled:opacity-60"
          >
            <Upload size={18} />
            {busy === '파일을 읽는 중…' ? busy : '파일 선택'}
          </button>
        </section>

        <section className="rounded-xl border border-red-200 bg-white p-4">
          <h2 className="font-semibold text-red-700">전체 초기화</h2>
          <p className="mt-1 text-sm text-neutral-500">
            모든 품목·이력·영수증을 지워요. 되돌릴 수 없으니 먼저 내보내 두세요.
          </p>
          <button
            onClick={() => setResetting(true)}
            className="mt-3 min-h-11 w-full rounded-xl border border-red-300 font-medium text-red-600"
          >
            전체 초기화
          </button>
        </section>
      </main>

      {pending && (
        <ImportSheet
          parsed={pending}
          skippedTotal={skippedTotal}
          mode={mode}
          busy={busy}
          onMode={setMode}
          onCancel={() => setPending(null)}
          onConfirm={handleImport}
        />
      )}

      <ConfirmModal
        open={resetting}
        title="전체 데이터를 지울까요?"
        message={`품목 ${items.length}개와 이력 ${purchases.length}건, 영수증이 모두 사라져요. 되돌릴 수 없어요. 실행하려면 아래에 "초기화"를 입력해 주세요.`}
        confirmLabel="초기화"
        confirmPhrase="초기화"
        onConfirm={handleReset}
        onCancel={() => setResetting(false)}
      />
    </>
  )
}

/**
 * G2 — 저장소가 언제 사라질 수 있는지 알리고, 막을 방법을 바로 옆에 둔다.
 *
 * 홈 화면에 추가하면 iOS의 7일 삭제에서 벗어나고, 안드로이드에서는 영속 저장소
 * 승인 조건을 만족시킨다. 경고만 하고 방법을 안 알려주면 아무것도 바뀌지 않는다.
 */
function StorageBanner({
  persisted,
  estimate,
}: {
  persisted: boolean | null
  estimate: { usage: number; quota: number } | null
}) {
  const install = useInstall()
  const toast = useToast()
  const [showSteps, setShowSteps] = useState(false)

  const safe = persisted === true && install.status === 'installed'

  return (
    <section
      className={`rounded-xl border p-4 ${safe ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
    >
      <div className="flex gap-2">
        {safe ? (
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
        )}
        <div className="min-w-0 text-sm">
          <p className={`font-medium ${safe ? 'text-emerald-800' : 'text-amber-900'}`}>
            {safe ? '데이터가 안전하게 보관돼요' : '데이터가 지워질 수 있어요'}
          </p>
          <p className={`mt-1 ${safe ? 'text-emerald-700' : 'text-amber-800'}`}>
            {safe
              ? '홈 화면 앱으로 실행 중이고 브라우저가 이 데이터를 함부로 지우지 않아요.'
              : install.status === 'installed'
                ? '홈 화면 앱으로 실행 중이지만 브라우저가 저장소 보호를 아직 승인하지 않았어요. 며칠 더 쓰면 대부분 자동으로 승인돼요.'
                : '아이폰은 7일간 방문이 없으면, 안드로이드는 저장 공간이 부족하면 이 데이터를 지울 수 있어요. 홈 화면에 추가하면 막을 수 있어요.'}
          </p>

          {estimate && (
            <p className="tabular mt-1 text-xs text-neutral-500">
              사용 중 {formatBytes(estimate.usage)}
              {estimate.quota > 0 && ` / ${formatBytes(estimate.quota)}`}
            </p>
          )}
        </div>
      </div>

      {install.status === 'ready' && (
        <button
          onClick={async () => {
            const accepted = await install.install()
            if (!accepted) toast('설치를 취소했어요. 설정에서 언제든 다시 할 수 있어요.', 'info')
          }}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 font-medium text-white"
        >
          <Smartphone size={18} />
          홈 화면에 추가
        </button>
      )}

      {install.status === 'manual' && (
        <>
          <button
            onClick={() => setShowSteps((v) => !v)}
            aria-expanded={showSteps}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300 font-medium text-amber-900"
          >
            <Smartphone size={18} />
            홈 화면에 추가하는 방법
          </button>
          {showSteps && (
            <ol className="mt-2 list-decimal space-y-1 rounded-lg bg-white/70 p-3 pl-7 text-sm text-amber-900">
              {install.platform === 'ios' ? (
                <>
                  <li>사파리 아래쪽 공유 버튼을 누르세요.</li>
                  <li>목록에서 "홈 화면에 추가"를 고르세요.</li>
                  <li>오른쪽 위 "추가"를 누르면 끝이에요.</li>
                </>
              ) : (
                <>
                  <li>브라우저 메뉴(⋮)를 여세요.</li>
                  <li>"홈 화면에 추가" 또는 "앱 설치"를 고르세요.</li>
                  <li>안내에 따라 추가하면 끝이에요.</li>
                </>
              )}
            </ol>
          )}
        </>
      )}
    </section>
  )
}

function ImportSheet({
  parsed,
  skippedTotal,
  mode,
  busy,
  onMode,
  onCancel,
  onConfirm,
}: {
  parsed: ParsedBackup
  skippedTotal: number
  mode: Mode
  busy: string | null
  onMode: (mode: Mode) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const { data, skipped } = parsed

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-neutral-900/40" onClick={onCancel} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="가져오기"
        className="relative w-full max-w-md rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl"
      >
        <h2 className="font-semibold">이 파일을 복원할까요?</h2>
        <dl className="tabular mt-3 space-y-1 rounded-xl bg-neutral-50 p-3 text-sm">
          <Row label="품목" value={`${data.items.length}개`} />
          <Row label="구매 이력" value={`${data.purchases.length}건`} />
          <Row label="영수증" value={data.receipts.length > 0 ? `${data.receipts.length}장` : '없음'} />
          {data.exportedAt && (
            <Row label="내보낸 날짜" value={data.exportedAt.slice(0, 10).replace(/-/g, '.')} />
          )}
        </dl>

        {skippedTotal > 0 && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            형식이 맞지 않는 {skippedTotal}건은 건너뛰어요 (품목 {skipped.items}, 이력{' '}
            {skipped.purchases}, 영수증 {skipped.receipts}).
          </p>
        )}

        <div className="mt-4 space-y-2">
          <ModeOption
            active={mode === 'merge'}
            title="기존 데이터에 합치기"
            description="지금 데이터를 그대로 두고 더해요. id가 겹치면 새로 발급해요."
            onClick={() => onMode('merge')}
          />
          <ModeOption
            active={mode === 'overwrite'}
            title="덮어쓰기"
            description="지금 데이터를 모두 지우고 파일 내용으로 바꿔요."
            danger
            onClick={() => onMode('overwrite')}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy != null}
            className="min-h-11 flex-1 rounded-xl border border-neutral-300 font-medium text-neutral-700"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={busy != null}
            className={`min-h-11 flex-1 rounded-xl font-medium text-white disabled:opacity-60 ${
              mode === 'overwrite' ? 'bg-red-600' : 'bg-indigo-600'
            }`}
          >
            {busy === '복원하는 중…' ? busy : mode === 'overwrite' ? '덮어쓰기' : '합치기'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModeOption({
  active,
  title,
  description,
  danger,
  onClick,
}: {
  active: boolean
  title: string
  description: string
  danger?: boolean
  onClick: () => void
}) {
  const accent = danger ? 'border-red-500 bg-red-50' : 'border-indigo-600 bg-indigo-50'
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`w-full rounded-xl border p-3 text-left ${active ? accent : 'border-neutral-300'}`}
    >
      <p className={`text-sm font-medium ${active && danger ? 'text-red-700' : 'text-neutral-900'}`}>
        {title}
      </p>
      <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
    </button>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-neutral-800">{value}</dd>
    </div>
  )
}
