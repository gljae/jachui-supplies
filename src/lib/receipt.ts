/**
 * 영수증 이미지 처리 파이프라인 (SPEC 4절).
 *
 * 순서대로 실행하고, 각 단계에서 실패하면 즉시 중단한다.
 * 어떤 실패든 품목·가격 등 나머지 데이터 저장을 막지 않는다 — 영수증만 빠진다.
 */

export const MAX_INPUT_BYTES = 10 * 1024 * 1024
export const MAX_STORED_BYTES = 1.5 * 1024 * 1024
export const MAX_WIDTH = 1200

const FIRST_QUALITY = 0.7
const RETRY_QUALITY = 0.5

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']

export type ReceiptFailure = 'tooLarge' | 'unsupported' | 'decodeFailed' | 'stillTooLarge'

export type ReceiptResult =
  | { ok: true; blob: Blob; mimeType: string; size: number }
  | { ok: false; reason: ReceiptFailure; message: string }

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${Math.round(bytes / 1024)}KB`
}

/**
 * 형식 화이트리스트. 확장자도 함께 본다 —
 * 일부 안드로이드 파일 선택기는 HEIC의 MIME 타입을 빈 문자열로 준다.
 */
export function isSupportedType(file: { type: string; name: string }): boolean {
  if (SUPPORTED_TYPES.includes(file.type.toLowerCase())) return true
  const name = file.name.toLowerCase()
  return SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

export function isWithinInputLimit(size: number): boolean {
  return size <= MAX_INPUT_BYTES
}

/**
 * 이미지를 디코딩한다.
 *
 * EXIF orientation은 브라우저에 맡긴다. 직접 회전 행렬을 적용하면
 * 이미 보정해서 넘겨준 이미지를 한 번 더 돌려 눕혀버린다(이중 회전).
 * createImageBitmap의 'from-image'가 표준 경로이고, <img> 폴백에서도
 * 최신 브라우저는 CSS image-orientation 기본값이 from-image라 알아서 세워준다.
 */
async function decode(file: File): Promise<{
  draw: CanvasImageSource
  width: number
  height: number
  release: () => void
}> {
  // 1순위 — orientation을 명시한 createImageBitmap
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return {
      draw: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    }
  } catch {
    // 옵션을 모르는 구형 브라우저일 수 있으니 옵션 없이 한 번 더
  }

  try {
    const bitmap = await createImageBitmap(file)
    return {
      draw: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    }
  } catch {
    // <img> 폴백으로 넘어간다
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode failed'))
      el.src = url
    })
    return {
      draw: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      // 여기서 해제하지 않으면 고른 사진마다 메모리가 쌓인다
      release: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

/** canvas.toBlob은 콜백에 null을 줄 수 있다. 그대로 쓰면 그 자리에서 터진다. */
function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
  })
}

export async function processReceipt(file: File): Promise<ReceiptResult> {
  // 1. 원본 크기 검사 — 압축을 시도하지도 않는다
  if (!isWithinInputLimit(file.size)) {
    return {
      ok: false,
      reason: 'tooLarge',
      message: `파일 용량이 너무 커요 (${formatBytes(file.size)}). 10MB 이하만 첨부할 수 있어요.`,
    }
  }

  // 2. 형식 검사
  if (!isSupportedType(file)) {
    return {
      ok: false,
      reason: 'unsupported',
      message: '이 형식은 지원하지 않아요. JPG, PNG, WebP로 다시 시도해 주세요.',
    }
  }

  // 3. 디코딩
  let decoded: Awaited<ReturnType<typeof decode>>
  try {
    decoded = await decode(file)
  } catch {
    return {
      ok: false,
      reason: 'decodeFailed',
      // HEIC는 데스크톱 크롬·파이어폭스가 디코딩하지 못한다. 실패가 정상 경로다
      message: '이미지를 읽지 못했어요. 아이폰 사진이라면 JPG로 저장한 뒤 다시 시도해 주세요.',
    }
  }

  try {
    if (decoded.width === 0 || decoded.height === 0) {
      return {
        ok: false,
        reason: 'decodeFailed',
        message: '이미지를 읽지 못했어요. 다른 파일로 시도해 주세요.',
      }
    }

    // 4. 리사이즈 — 가로 최대 1200px, 원본이 더 작으면 확대하지 않는다
    const scale = Math.min(1, MAX_WIDTH / decoded.width)
    const width = Math.round(decoded.width * scale)
    const height = Math.round(decoded.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return {
        ok: false,
        reason: 'decodeFailed',
        message: '이미지를 처리하지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
      }
    }
    ctx.drawImage(decoded.draw, 0, 0, width, height)

    // 5. 1차 압축
    let blob = await toBlob(canvas, FIRST_QUALITY)

    // 6. 재압축 — 1.5MB를 넘으면 화질을 낮춰 한 번만 다시
    if (blob && blob.size > MAX_STORED_BYTES) {
      blob = await toBlob(canvas, RETRY_QUALITY)
    }

    if (!blob) {
      return {
        ok: false,
        reason: 'decodeFailed',
        message: '이미지를 변환하지 못했어요. 다른 파일로 시도해 주세요.',
      }
    }

    // 7. 최종 판정
    if (blob.size > MAX_STORED_BYTES) {
      return {
        ok: false,
        reason: 'stillTooLarge',
        message: `이미지 용량이 너무 커서 저장할 수 없어요 (${formatBytes(blob.size)}). 영수증 없이 나머지는 저장돼요.`,
      }
    }

    // 작은 PNG를 JPEG로 바꾸면 오히려 커질 수 있다.
    // 리사이즈가 없었고 원본이 더 작으면서 한도 안이라면 원본을 그대로 둔다.
    if (scale === 1 && file.size <= MAX_STORED_BYTES && file.size < blob.size) {
      return { ok: true, blob: file, mimeType: file.type || 'image/jpeg', size: file.size }
    }

    return { ok: true, blob, mimeType: 'image/jpeg', size: blob.size }
  } finally {
    decoded.release()
  }
}
