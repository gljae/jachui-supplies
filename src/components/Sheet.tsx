import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

/** 바텀시트. 배경 탭과 Esc로 닫힌다. */
export default function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // 시트가 열린 동안 뒤 배경이 스크롤되지 않게 한다
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  /**
   * G8 — 모바일에서 시트를 닫는 가장 자연스러운 동작은 뒤로 가기다.
   * 그대로 두면 화면 자체가 뒤로 넘어가 사용자가 쓰던 입력이 사라진다.
   *
   * 히스토리에 표시용 항목을 하나 얹고 뒤로 가기를 받아 시트만 닫는다.
   * 닫기 버튼으로 닫았을 때는 우리가 넣은 항목을 되돌려 히스토리를 원래대로 남긴다.
   */
  useEffect(() => {
    if (!open) return

    const marker = `sheet-${Date.now()}`
    window.history.pushState({ sheet: marker }, '')

    let closedByBack = false
    const onPopState = () => {
      closedByBack = true
      onClose()
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      if (!closedByBack && window.history.state?.sheet === marker) {
        window.history.back()
      }
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-neutral-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="-mr-2 flex size-11 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
          >
            <X size={20} />
          </button>
        </header>
        <div className="overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  )
}
