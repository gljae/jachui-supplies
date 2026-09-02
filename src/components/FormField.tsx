import type { ReactNode } from 'react'

/** 라벨 + 입력 + 인라인 에러. 에러는 항상 해당 필드 바로 아래에 붙는다 (SPEC 3-2). */
export default function FormField({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string
  error?: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    // 라벨이 입력을 감싸면 htmlFor/id 없이도 연결된다. 라벨을 탭하면 입력에 포커스가 간다
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-sm text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-sm text-neutral-500">{hint}</span>
      ) : null}
    </label>
  )
}

/** 폭을 직접 정하고 싶을 때 쓰는 기본 스타일. w-full이 붙어 있지 않다 */
export const controlClass =
  'min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-base ' +
  'outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'

export const inputClass = `w-full ${controlClass}`

export const inputErrorClass =
  'w-full min-h-11 rounded-xl border border-red-400 bg-white px-3 text-base ' +
  'outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100'
