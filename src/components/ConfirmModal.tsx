import { useEffect, useState } from 'react'

/**
 * 삭제 확인 모달. SPEC 7절 — 삭제는 항상 확인을 거친다.
 * confirmPhrase를 주면 그 문구를 직접 입력해야 실행된다 (전체 초기화용).
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = '삭제',
  confirmPhrase,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmPhrase?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    // Sheet와 동일하게 배경 스크롤을 잠근다. 잠그지 않으면 모바일에서
    // 모달 뒤 화면이 그대로 밀린다
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-neutral-900/50" onClick={onCancel} aria-hidden="true" />
      {/*
        본문을 별도 컴포넌트로 두면 모달이 열릴 때마다 새로 마운트되어 입력과
        진행 상태가 저절로 초기화된다. 바깥에 두면 취소하고 다시 열었을 때
        지난번에 친 확인 문구가 남아 한 번 더 누르는 것만으로 실행돼 버린다.
      */}
      <Body
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        confirmPhrase={confirmPhrase}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </div>
  )
}

function Body({
  title,
  message,
  confirmLabel,
  confirmPhrase,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  confirmPhrase?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  const blocked = confirmPhrase != null && typed.trim() !== confirmPhrase

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
    >
      <h2 className="font-semibold text-neutral-900">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">{message}</p>

      {confirmPhrase != null && (
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={confirmPhrase}
          aria-label={`${confirmPhrase} 입력`}
          className="mt-3 min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-base outline-none focus:border-red-500"
        />
      )}

      <div className="mt-5 flex gap-2">
        <button
          onClick={onCancel}
          className="min-h-11 flex-1 rounded-xl border border-neutral-300 font-medium text-neutral-700"
        >
          취소
        </button>
        <button
          onClick={handleConfirm}
          disabled={blocked || busy}
          className="min-h-11 flex-1 rounded-xl bg-red-600 font-medium text-white disabled:opacity-50"
        >
          {busy ? '처리 중…' : confirmLabel}
        </button>
      </div>
    </div>
  )
}
