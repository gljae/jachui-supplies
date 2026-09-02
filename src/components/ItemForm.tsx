import { useMemo, useState } from 'react'
import { DBError } from '../lib/db'
import { todayStr } from '../lib/format'
import { ALL_UNITS } from '../lib/units'
import { useData, type NewEntry } from '../state/DataContext'
import type { ItemType, Unit } from '../types'
import FormField, { controlClass, inputClass, inputErrorClass } from './FormField'
import { useToast } from './Toast'

interface Values {
  type: ItemType
  name: string
  category: string
  brand: string
  volume: string
  unit: Unit
  quantity: string
  price: string
  purchaseDate: string
}

type Errors = Partial<Record<keyof Values | 'submit', string>>

function initialValues(): Values {
  return {
    type: 'consumable',
    name: '',
    category: '',
    brand: '',
    volume: '',
    unit: 'ml',
    quantity: '1',
    price: '',
    purchaseDate: todayStr(),
  }
}

/**
 * 숫자 입력 파싱. 빈 문자열은 null로 돌려준다.
 * G3 — Number('')는 0이라 그대로 쓰면 빈 칸이 0으로 통과해 버린다.
 */
function parseNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

export default function ItemForm({ onDone }: { onDone: () => void }) {
  const { items, addEntry } = useData()
  const toast = useToast()
  const [values, setValues] = useState<Values>(initialValues)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  const today = todayStr()

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(),
    [items],
  )

  /** 이름이 기존 품목과 일치하면 그 품목의 이력으로 붙는다. 타입도 기존 품목을 따른다. */
  const matchedItem = useMemo(
    () => items.find((i) => i.name === values.name.trim()),
    [items, values.name],
  )
  const effectiveType = matchedItem?.type ?? values.type
  const isConsumable = effectiveType === 'consumable'

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
    // 사용자가 고치기 시작하면 그 필드의 에러는 지운다
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  function validate(): Errors | null {
    const next: Errors = {}

    if (!values.name.trim()) next.name = '품목명을 입력해 주세요.'
    // 기존 품목에 붙는 경우 카테고리는 그 품목 것을 따르므로 입력란이 비어 있는 게 정상이다
    if (!matchedItem && !values.category.trim()) next.category = '카테고리를 입력해 주세요.'

    if (!values.purchaseDate) {
      next.purchaseDate = '구매일을 골라 주세요.'
    } else if (values.purchaseDate > today) {
      // input[max]만으로는 부족하다. 직접 입력이나 일부 모바일 키보드가 통과시킨다 (G1)
      next.purchaseDate = `구매일은 오늘(${today})까지만 고를 수 있어요.`
    }

    const price = parseNumber(values.price)
    if (price == null) next.price = '가격을 입력해 주세요.'
    else if (price < 0) next.price = '가격은 0원 이상이어야 해요.'

    if (isConsumable) {
      const quantity = parseNumber(values.quantity)
      if (quantity == null) next.quantity = '구매 개수를 입력해 주세요.'
      else if (quantity <= 0) next.quantity = '구매 개수는 1개 이상이어야 해요.'
      else if (!Number.isInteger(quantity)) next.quantity = '구매 개수는 정수로 입력해 주세요.'

      const volume = parseNumber(values.volume)
      if (volume == null) next.volume = '1개당 용량을 입력해 주세요.'
      else if (volume <= 0) next.volume = '용량은 0보다 커야 해요.'
    }

    return Object.keys(next).length > 0 ? next : null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const found = validate()
    if (found) {
      setErrors(found)
      return
    }

    setSaving(true)
    try {
      const entry: NewEntry = {
        name: values.name.trim(),
        category: values.category.trim(),
        type: effectiveType,
        brand: values.brand,
        volume: isConsumable ? (parseNumber(values.volume) as number) : undefined,
        unit: isConsumable ? values.unit : undefined,
        quantity: isConsumable ? (parseNumber(values.quantity) as number) : 1,
        price: parseNumber(values.price) as number,
        purchaseDate: values.purchaseDate,
      }
      await addEntry(entry)
      onDone()
    } catch (error) {
      // SPEC 3-2 — 저장에 실패해도 입력값은 그대로 둔다
      const message = error instanceof DBError ? error.message : '저장하지 못했어요.'
      setErrors({ submit: message })
      toast(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-2">
        {(['consumable', 'oneTime'] as const).map((type) => {
          const active = effectiveType === type
          return (
            <button
              key={type}
              type="button"
              disabled={!!matchedItem}
              onClick={() => set('type', type)}
              className={`min-h-11 rounded-xl border text-sm font-medium transition ${
                active
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-neutral-300 text-neutral-600'
              } ${matchedItem ? 'opacity-60' : ''}`}
            >
              {type === 'consumable' ? '소모품' : '일회성'}
            </button>
          )
        })}
      </div>

      <FormField
        label="품목명"
        required
        error={errors.name}
        hint={matchedItem ? `기존 "${matchedItem.name}"의 이력으로 추가됩니다.` : undefined}
      >
        <input
          list="item-names"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="세탁세제"
          className={errors.name ? inputErrorClass : inputClass}
        />
        <datalist id="item-names">
          {items.map((i) => (
            <option key={i.id} value={i.name} />
          ))}
        </datalist>
      </FormField>

      <FormField label="카테고리" required error={errors.category}>
        <input
          list="categories"
          value={matchedItem ? matchedItem.category : values.category}
          onChange={(e) => set('category', e.target.value)}
          disabled={!!matchedItem}
          placeholder="생활용품"
          className={errors.category ? inputErrorClass : inputClass}
        />
        <datalist id="categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </FormField>

      {isConsumable && (
        <>
          <FormField label="브랜드">
            <input
              value={values.brand}
              onChange={(e) => set('brand', e.target.value)}
              placeholder="선택 사항"
              className={inputClass}
            />
          </FormField>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <FormField label="1개당 용량" required error={errors.volume}>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={values.volume}
                onChange={(e) => set('volume', e.target.value)}
                placeholder="3"
                className={errors.volume ? inputErrorClass : inputClass}
              />
            </FormField>
            <FormField label="단위">
              <select
                value={values.unit}
                onChange={(e) => set('unit', e.target.value as Unit)}
                className={`${controlClass} w-24`}
              >
                {ALL_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="구매 개수" required error={errors.quantity}>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              value={values.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              className={errors.quantity ? inputErrorClass : inputClass}
            />
          </FormField>
        </>
      )}

      <FormField label="가격 (총액)" required error={errors.price}>
        <input
          type="number"
          inputMode="numeric"
          step="1"
          min="0"
          value={values.price}
          onChange={(e) => set('price', e.target.value)}
          placeholder="18000"
          className={errors.price ? inputErrorClass : inputClass}
        />
      </FormField>

      <FormField label="구매일" required error={errors.purchaseDate}>
        <input
          type="date"
          max={today}
          value={values.purchaseDate}
          onChange={(e) => set('purchaseDate', e.target.value)}
          className={errors.purchaseDate ? inputErrorClass : inputClass}
        />
      </FormField>

      {errors.submit && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errors.submit}</p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="min-h-12 w-full rounded-xl bg-indigo-600 font-medium text-white disabled:opacity-60"
      >
        {saving ? '저장 중…' : '저장'}
      </button>
    </form>
  )
}
