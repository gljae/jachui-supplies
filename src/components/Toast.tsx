import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type Tone = 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  tone: Tone
}

const ToastContext = createContext<((message: string, tone?: Tone) => void) | null>(null)

/**
 * A5 — 저장소 실패를 조용히 넘기지 않기 위한 알림 통로.
 * DB 호출부는 실패를 잡아 여기로 보내고, 사용자는 무엇이 실패했는지 보게 된다.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((message: string, tone: Tone = 'error') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, tone }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
  }, [])

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 mx-auto flex max-w-md flex-col gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm shadow-lg ${
              toast.tone === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-neutral-900 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast는 ToastProvider 안에서만 쓸 수 있습니다.')
  return show
}
