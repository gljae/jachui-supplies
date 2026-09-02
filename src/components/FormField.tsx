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
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-700">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-sm text-neutral-500">{hint}</p>
      ) : null}
    </div>
  )
}

export const inputClass =
  'w-full min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-base ' +
  'outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'

export const inputErrorClass =
  'w-full min-h-11 rounded-xl border border-red-400 bg-white px-3 text-base ' +
  'outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100'
