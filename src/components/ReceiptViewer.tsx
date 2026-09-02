import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DBError, receiptRepo } from '../lib/db'
import { formatBytes } from '../lib/receipt'

/**
 * Blob을 화면에 띄울 수 있는 URL로 바꾼다.
 * 해제하지 않으면 열고 닫을 때마다 메모리가 쌓인다.
 */
function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])

  return url
}

/**
 * 목록에 붙는 썸네일. 상세 화면에 들어온 뒤에야 Blob을 읽는다 —
 * 목록 조회에서 이미지를 함께 읽으면 초기 로딩이 느려진다(SPEC 0절).
 */
export function ReceiptThumb({ purchaseId }: { purchaseId: string }) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const url = useBlobUrl(blob)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const receipt = await receiptRepo.get(purchaseId)
        if (!alive) return
        if (receipt) setBlob(receipt.blob)
        else setError('영수증을 찾지 못했어요.')
      } catch (e) {
        if (alive) setError(e instanceof DBError ? e.message : '영수증을 불러오지 못했어요.')
      }
    })()
    return () => {
      alive = false
    }
  }, [purchaseId])

  if (error) return <p className="mt-2 text-xs text-red-600">{error}</p>
  if (!url) return <div className="mt-2 h-16 w-16 animate-pulse rounded-lg bg-neutral-200" />

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-2 block overflow-hidden rounded-lg border border-neutral-200"
        aria-label="영수증 크게 보기"
      >
        <img src={url} alt="영수증 썸네일" className="h-16 w-16 object-cover" />
      </button>

      {open && <ReceiptViewer url={url} size={blob?.size} onClose={() => setOpen(false)} />}
    </>
  )
}

/** 전체화면 뷰어 */
export default function ReceiptViewer({
  url,
  size,
  onClose,
}: {
  url: string
  size?: number
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="영수증"
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950"
    >
      <header className="flex items-center justify-between px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <span className="pl-2 text-sm text-neutral-400">
          영수증{size != null && ` · ${formatBytes(size)}`}
        </span>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="flex size-11 items-center justify-center rounded-lg text-neutral-300 hover:bg-neutral-800"
        >
          <X size={22} />
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-auto p-2">
        <img src={url} alt="영수증" className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  )
}
