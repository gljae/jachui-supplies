import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  isSupportedType,
  isWithinInputLimit,
  MAX_INPUT_BYTES,
  MAX_STORED_BYTES,
} from './receipt'

// canvas가 필요한 부분은 브라우저에서 확인한다. 여기서는 순수 판정만 고정한다.

describe('입력 크기 한도', () => {
  it('10MB까지 받는다', () => {
    expect(MAX_INPUT_BYTES).toBe(10 * 1024 * 1024)
    expect(isWithinInputLimit(MAX_INPUT_BYTES)).toBe(true)
    expect(isWithinInputLimit(MAX_INPUT_BYTES + 1)).toBe(false)
  })

  it('저장 한도는 1.5MB', () => {
    expect(MAX_STORED_BYTES).toBe(1.5 * 1024 * 1024)
  })
})

describe('형식 판정', () => {
  it('지원 형식을 MIME으로 받는다', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) {
      expect(isSupportedType({ type, name: 'receipt' })).toBe(true)
    }
  })

  it('MIME 대소문자를 가리지 않는다', () => {
    expect(isSupportedType({ type: 'IMAGE/JPEG', name: 'a' })).toBe(true)
  })

  it('MIME이 비어 있어도 확장자로 받는다', () => {
    // 일부 안드로이드 파일 선택기는 HEIC의 타입을 빈 문자열로 준다
    expect(isSupportedType({ type: '', name: 'IMG_0421.HEIC' })).toBe(true)
    expect(isSupportedType({ type: '', name: 'photo.jpg' })).toBe(true)
  })

  it('지원하지 않는 형식은 막는다', () => {
    expect(isSupportedType({ type: 'application/pdf', name: 'receipt.pdf' })).toBe(false)
    expect(isSupportedType({ type: 'image/gif', name: 'a.gif' })).toBe(false)
    expect(isSupportedType({ type: '', name: 'noext' })).toBe(false)
  })
})

describe('용량 표기', () => {
  it('1MB 미만은 KB, 이상은 MB', () => {
    expect(formatBytes(512 * 1024)).toBe('512KB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5MB')
  })
})
