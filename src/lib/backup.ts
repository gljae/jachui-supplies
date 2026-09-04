import type { Item, ItemType, Purchase, Unit } from '../types'
import { toCountingUnits } from './migrate'
import { ALL_UNITS, totalUnitsOf } from './units'

export const BACKUP_SCHEMA = 'jachui-supplies-backup'
/** 2 — 남은 개수와 소진일을 포장 단위에서 셈 단위로 옮겼다 (migrate.ts) */
export const BACKUP_VERSION = 2

/**
 * 읽어들일 수 있는 버전. 예전 파일을 거절하면 백업이 백업 구실을 못 한다.
 * v1은 가져오면서 셈 단위로 옮긴다.
 */
const READABLE_VERSIONS = [1, 2]

export interface BackupReceipt {
  purchaseId: string
  mimeType: string
  size: number
  /** base64 */
  data: string
}

export interface BackupFile {
  schema: typeof BACKUP_SCHEMA
  version: typeof BACKUP_VERSION
  exportedAt: string
  includeReceipts: boolean
  items: Item[]
  purchases: Purchase[]
  receipts: BackupReceipt[]
}

export interface SkipCounts {
  items: number
  purchases: number
  receipts: number
}

export interface ParsedBackup {
  data: BackupFile
  /** 형식이 맞지 않아 버린 행 수 */
  skipped: SkipCounts
}

export type ParseResult = { ok: true; parsed: ParsedBackup } | { ok: false; message: string }

// ─── base64 ───────────────────────────────────────────────────────────────

/**
 * G9 — btoa(String.fromCharCode(...bytes))는 배열이 크면 스택이 넘친다.
 * 영수증 한 장이 수백 KB라 그대로 쓰면 실제로 터진다. 조각내서 붙인다.
 */
const CHUNK = 8192

export function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK))
  }
  return btoa(binary)
}

export function decodeBase64(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ─── 검증 ─────────────────────────────────────────────────────────────────

const ITEM_TYPES: ItemType[] = ['oneTime', 'consumable']
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function validItem(raw: unknown): Item | null {
  if (!isRecord(raw)) return null
  if (!nonEmptyString(raw.id) || !nonEmptyString(raw.name)) return null
  if (typeof raw.category !== 'string') return null
  if (!ITEM_TYPES.includes(raw.type as ItemType)) return null

  return {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    type: raw.type as ItemType,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
  }
}

/**
 * G3 — 여기서 막지 않으면 0으로 나눈 Infinity가 평균 계산 전체를 오염시킨다.
 * 폼은 막고 있지만 가져오기는 남이 만든 파일을 받는 입구다.
 */
function validPurchase(raw: unknown, version: number): Purchase | null {
  if (!isRecord(raw)) return null
  if (!nonEmptyString(raw.id) || !nonEmptyString(raw.itemId)) return null
  if (typeof raw.purchaseDate !== 'string' || !DATE_PATTERN.test(raw.purchaseDate)) return null

  const quantity = Number(raw.quantity)
  const price = Number(raw.price)
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  if (!Number.isFinite(price) || price < 0) return null

  let volume: number | undefined
  let unit: Unit | undefined
  if (raw.volume != null && raw.unit != null) {
    const parsed = Number(raw.volume)
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    if (!ALL_UNITS.includes(raw.unit as Unit)) return null
    volume = parsed
    unit = raw.unit as Unit
  }

  // v1은 남은 개수를 포장 단위로 셌다. 그 파일의 상한은 총 개수가 아니라 구매 개수다
  const cap = version === 1 ? quantity : totalUnitsOf({ volume, unit, quantity })
  const rawRemaining = Number(raw.remaining)
  const remaining = Number.isFinite(rawRemaining) ? Math.min(Math.max(rawRemaining, 0), cap) : cap

  const depletionDates = Array.isArray(raw.depletionDates)
    ? raw.depletionDates.filter((d): d is string => typeof d === 'string' && DATE_PATTERN.test(d)).sort()
    : []

  return {
    id: raw.id,
    itemId: raw.itemId,
    brand: nonEmptyString(raw.brand) ? raw.brand : undefined,
    volume,
    unit,
    quantity,
    remaining,
    price,
    purchaseDate: raw.purchaseDate,
    depletionDates,
    hasReceipt: raw.hasReceipt === true,
  }
}

function validReceipt(raw: unknown): BackupReceipt | null {
  if (!isRecord(raw)) return null
  if (!nonEmptyString(raw.purchaseId) || !nonEmptyString(raw.data)) return null
  return {
    purchaseId: raw.purchaseId,
    mimeType: nonEmptyString(raw.mimeType) ? raw.mimeType : 'image/jpeg',
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : 0,
    data: raw.data,
  }
}

/**
 * 파일을 읽어 쓸 수 있는 형태로 바꾼다. 순수 함수라 저장소를 건드리지 않는다.
 *
 * 파일 자체가 우리 것이 아니면 통째로 거절한다. 개별 행은 형식이 어긋난 것만
 * 버리고 몇 건을 버렸는지 알린다 — 한 줄이 깨졌다고 나머지 수백 건을 못 살리면
 * 백업이 백업 구실을 못 한다.
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, message: '읽을 수 없는 파일이에요. 내보내기로 만든 JSON 파일을 골라 주세요.' }
  }

  if (!isRecord(raw) || raw.schema !== BACKUP_SCHEMA) {
    return { ok: false, message: '이 앱에서 내보낸 파일이 아니에요.' }
  }
  if (typeof raw.version !== 'number' || !READABLE_VERSIONS.includes(raw.version)) {
    return {
      ok: false,
      message: `백업 버전이 달라요 (파일 v${String(raw.version)}, 앱 v${BACKUP_VERSION}). 앱을 최신으로 올린 뒤 다시 시도해 주세요.`,
    }
  }
  const version = raw.version
  if (!Array.isArray(raw.items) || !Array.isArray(raw.purchases)) {
    return { ok: false, message: '파일 내용이 손상됐어요. 다른 백업 파일로 시도해 주세요.' }
  }

  const items: Item[] = []
  let skippedItems = 0
  for (const candidate of raw.items) {
    const item = validItem(candidate)
    if (item) items.push(item)
    else skippedItems++
  }

  const itemIds = new Set(items.map((i) => i.id))
  const purchases: Purchase[] = []
  let skippedPurchases = 0
  for (const candidate of raw.purchases) {
    const parsed = validPurchase(candidate, version)
    // v1 파일은 포장 단위로 세어 뒀다. 읽으면서 셈 단위로 옮긴다
    const purchase = parsed && version === 1 ? (toCountingUnits(parsed) ?? parsed) : parsed
    // 품목이 없는 고아 이력은 버린다. 목록에도 통계에도 낄 자리가 없다
    if (purchase && itemIds.has(purchase.itemId)) purchases.push(purchase)
    else skippedPurchases++
  }

  const purchaseIds = new Set(purchases.map((p) => p.id))
  const receipts: BackupReceipt[] = []
  let skippedReceipts = 0
  const rawReceipts = Array.isArray(raw.receipts) ? raw.receipts : []
  for (const candidate of rawReceipts) {
    const receipt = validReceipt(candidate)
    if (receipt && purchaseIds.has(receipt.purchaseId)) receipts.push(receipt)
    else skippedReceipts++
  }

  // 영수증이 빠진 백업이면 이력의 hasReceipt를 실제와 맞춘다.
  // 그러지 않으면 있지도 않은 이미지를 계속 읽으려 든다
  const withReceipt = new Set(receipts.map((r) => r.purchaseId))
  for (const purchase of purchases) {
    purchase.hasReceipt = withReceipt.has(purchase.id)
  }

  return {
    ok: true,
    parsed: {
      data: {
        schema: BACKUP_SCHEMA,
        version: BACKUP_VERSION,
        exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
        includeReceipts: receipts.length > 0,
        items,
        purchases,
        receipts,
      },
      skipped: { items: skippedItems, purchases: skippedPurchases, receipts: skippedReceipts },
    },
  }
}

// ─── 합치기용 id 재발급 ───────────────────────────────────────────────────

/**
 * A19 — items → purchases → receipts 순서로 매핑을 만들며 진행한다.
 * 순서를 지키지 않으면 itemId나 purchaseId가 옛 값을 가리켜 참조가 끊긴다.
 */
export function remapForMerge(
  data: Pick<BackupFile, 'items' | 'purchases' | 'receipts'>,
  existing: { itemIds: Set<string>; purchaseIds: Set<string> },
  newId: () => string,
): Pick<BackupFile, 'items' | 'purchases' | 'receipts'> {
  const itemIdMap = new Map<string, string>()
  const items = data.items.map((item) => {
    const id = existing.itemIds.has(item.id) ? newId() : item.id
    itemIdMap.set(item.id, id)
    return { ...item, id }
  })

  const purchaseIdMap = new Map<string, string>()
  const purchases = data.purchases.map((purchase) => {
    const id = existing.purchaseIds.has(purchase.id) ? newId() : purchase.id
    purchaseIdMap.set(purchase.id, id)
    return { ...purchase, id, itemId: itemIdMap.get(purchase.itemId) ?? purchase.itemId }
  })

  const receipts = data.receipts.map((receipt) => ({
    ...receipt,
    purchaseId: purchaseIdMap.get(receipt.purchaseId) ?? receipt.purchaseId,
  }))

  return { items, purchases, receipts }
}
