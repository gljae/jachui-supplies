import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreNames,
} from 'idb'
import type { Item, Purchase, Receipt } from '../types'
import { toCountingUnits } from './migrate'

const DB_NAME = 'jachui-supplies'
/** 2 — 남은 개수와 소진일을 포장 단위에서 셈 단위로 옮겼다 (migrate.ts) */
const DB_VERSION = 2

interface SuppliesDB extends DBSchema {
  items: {
    key: string
    value: Item
    indexes: { category: string; type: string }
  }
  purchases: {
    key: string
    value: Purchase
    indexes: { itemId: string; purchaseDate: string }
  }
  receipts: {
    key: string
    value: Receipt
  }
}

/**
 * 사용자에게 그대로 보여줄 수 있는 저장소 오류.
 * 무엇이 실패했는지 + 어떻게 하면 되는지를 담는다 (SPEC 7절).
 */
export class DBError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DBError'
  }
}

function describe(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'QuotaExceededError':
        return '저장 공간이 부족해요. 설정에서 오래된 영수증을 지우거나 데이터를 내보낸 뒤 정리해 주세요.'
      case 'InvalidStateError':
        return '브라우저가 저장소를 사용할 수 없는 상태예요. 시크릿 모드라면 일반 창에서 열어 주세요.'
      case 'VersionError':
        return '다른 탭에서 이 앱이 열려 있어요. 다른 탭을 닫고 새로고침해 주세요.'
    }
  }
  if (error instanceof Error && error.message) return error.message
  return '알 수 없는 오류예요.'
}

async function guard<T>(what: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw new DBError(`${what} ${describe(error)}`, { cause: error })
  }
}

let dbPromise: Promise<IDBPDatabase<SuppliesDB>> | null = null

export function getDB(): Promise<IDBPDatabase<SuppliesDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SuppliesDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        // G5 — 향후 버전 업그레이드에서 재실행돼도 안전하도록 존재 여부를 확인한다.
        if (!db.objectStoreNames.contains('items')) {
          const items = db.createObjectStore('items', { keyPath: 'id' })
          items.createIndex('category', 'category')
          items.createIndex('type', 'type')
        }
        if (!db.objectStoreNames.contains('purchases')) {
          const purchases = db.createObjectStore('purchases', { keyPath: 'id' })
          purchases.createIndex('itemId', 'itemId')
          purchases.createIndex('purchaseDate', 'purchaseDate')
        }
        if (!db.objectStoreNames.contains('receipts')) {
          db.createObjectStore('receipts', { keyPath: 'purchaseId' })
        }

        // 갓 만든 저장소(oldVersion 0)에는 옮길 이력이 없다
        if (oldVersion > 0 && oldVersion < 2) {
          void toCountingUnitsInPlace(tx).catch((error) => {
            // 실패하면 versionchange 트랜잭션이 통째로 되돌아가고 openDB가 거절한다.
            // 반쯤 옮겨진 데이터가 남지는 않으므로 여기서는 흔적만 남긴다
            console.error('셈 단위 이전에 실패했습니다.', error)
          })
        }
      },
      blocked() {
        console.warn('다른 탭이 이전 버전의 DB를 붙잡고 있습니다.')
      },
      blocking() {
        // 다른 탭이 새 버전으로 열려고 한다. 이 연결을 붙잡고 있으면 그 탭은 영영 못 연다.
        // 버전을 올릴 때마다 실제로 걸리는 함정이라, 놓아주고 다음 호출에서 다시 연다.
        void dbPromise?.then((db) => db.close()).catch(() => {})
        dbPromise = null
      },
      terminated() {
        // 브라우저가 연결을 끊으면 다음 호출에서 다시 열도록 캐시를 비운다.
        dbPromise = null
      },
    }).catch((error) => {
      dbPromise = null
      throw new DBError(`저장소를 열지 못했어요. ${describe(error)}`, { cause: error })
    })
  }
  return dbPromise
}

type UpgradeTx = IDBPTransaction<SuppliesDB, ArrayLike<StoreNames<SuppliesDB>>, 'versionchange'>

/**
 * v1 → v2. 저장된 이력을 하나씩 셈 단위로 고쳐 쓴다.
 *
 * G5 — versionchange 트랜잭션은 await 사이에 자동 커밋된다. 여기서는 IDB 호출만 하고
 * 그 밖의 비동기 작업을 끼워 넣지 않는다. 끼워 넣으면 앞부분만 옮겨진 채 커밋된다.
 */
async function toCountingUnitsInPlace(tx: UpgradeTx): Promise<void> {
  const store = tx.objectStore('purchases')
  let cursor = await store.openCursor()
  while (cursor) {
    const next = toCountingUnits(cursor.value)
    if (next) await cursor.update(next)
    cursor = await cursor.continue()
  }
}

export const itemsRepo = {
  all: () => guard('물품 목록을 불러오지 못했어요.', async () => (await getDB()).getAll('items')),
  get: (id: string) => guard('물품을 불러오지 못했어요.', async () => (await getDB()).get('items', id)),
  put: (item: Item) =>
    guard('물품을 저장하지 못했어요.', async () => {
      await (await getDB()).put('items', item)
    }),
}

export const purchaseRepo = {
  all: () => guard('구매 이력을 불러오지 못했어요.', async () => (await getDB()).getAll('purchases')),
  byItem: (itemId: string) =>
    guard('구매 이력을 불러오지 못했어요.', async () =>
      (await getDB()).getAllFromIndex('purchases', 'itemId', itemId),
    ),
  put: (purchase: Purchase) =>
    guard('구매 이력을 저장하지 못했어요.', async () => {
      await (await getDB()).put('purchases', purchase)
    }),
}

export const receiptRepo = {
  all: () => guard('영수증을 불러오지 못했어요.', async () => (await getDB()).getAll('receipts')),
  get: (purchaseId: string) =>
    guard('영수증을 불러오지 못했어요.', async () => (await getDB()).get('receipts', purchaseId)),
  put: (receipt: Receipt) =>
    guard('영수증을 저장하지 못했어요.', async () => {
      await (await getDB()).put('receipts', receipt)
    }),
}

/**
 * 품목과 이력을 한 트랜잭션에 쓴다.
 * 따로 쓰면 품목 저장만 성공하고 이력 저장이 실패했을 때
 * 이력 0건짜리 유령 품목이 목록에 남는다.
 */
export function putItemWithPurchase(
  item: Item,
  purchase: Purchase,
  receipt?: Receipt,
): Promise<void> {
  return guard('저장하지 못했어요.', async () => {
    const db = await getDB()
    const stores: ('items' | 'purchases' | 'receipts')[] = receipt
      ? ['items', 'purchases', 'receipts']
      : ['items', 'purchases']
    const tx = db.transaction(stores, 'readwrite')

    const writes: Promise<unknown>[] = [
      tx.objectStore('items').put(item),
      tx.objectStore('purchases').put(purchase),
    ]
    // 영수증만 따로 쓰면 hasReceipt는 true인데 이미지가 없는 이력이 생길 수 있다
    if (receipt) writes.push(tx.objectStore('receipts').put(receipt))

    await Promise.all([...writes, tx.done])
  })
}

/**
 * 이력 1건 + 연결된 영수증을 함께 지운다.
 *
 * G5 — 트랜잭션은 await 사이에 자동 커밋된다. 아래 블록 안에서는 IDB 호출만 하고
 * 그 밖의 비동기 작업(canvas, fetch 등)을 끼워 넣지 않는다.
 */
export function deletePurchaseCascade(purchaseId: string): Promise<void> {
  return guard('이력을 삭제하지 못했어요.', async () => {
    const db = await getDB()
    const tx = db.transaction(['purchases', 'receipts'], 'readwrite')
    await Promise.all([
      tx.objectStore('purchases').delete(purchaseId),
      tx.objectStore('receipts').delete(purchaseId),
      tx.done,
    ])
  })
}

/** 품목 + 그 품목의 모든 이력 + 영수증을 한 트랜잭션에서 지운다. */
export function deleteItemCascade(itemId: string): Promise<void> {
  return guard('물품을 삭제하지 못했어요.', async () => {
    const db = await getDB()
    const tx = db.transaction(['items', 'purchases', 'receipts'], 'readwrite')
    const purchases = tx.objectStore('purchases')
    const receipts = tx.objectStore('receipts')

    const ids = await purchases.index('itemId').getAllKeys(itemId)
    await Promise.all([
      ...ids.map((id) => purchases.delete(id)),
      ...ids.map((id) => receipts.delete(id as string)),
      tx.objectStore('items').delete(itemId),
      tx.done,
    ])
  })
}

/**
 * 백업 복원. 지우기와 쓰기를 한 트랜잭션에서 끝낸다.
 *
 * G2 — clearAll()을 먼저 부르고 따로 쓰면, 쓰는 도중 실패했을 때 기존 데이터도
 * 새 데이터도 남지 않는다. 사용자가 백업을 복원하려다 가진 걸 전부 잃는다.
 * 한 트랜잭션이면 중간에 실패해도 통째로 되돌아간다.
 */
export function restoreBackup(
  mode: 'overwrite' | 'merge',
  data: { items: Item[]; purchases: Purchase[]; receipts: Receipt[] },
): Promise<void> {
  return guard('복원하지 못했어요.', async () => {
    const db = await getDB()
    const tx = db.transaction(['items', 'purchases', 'receipts'], 'readwrite')
    const items = tx.objectStore('items')
    const purchases = tx.objectStore('purchases')
    const receipts = tx.objectStore('receipts')

    const writes: Promise<unknown>[] = []
    if (mode === 'overwrite') {
      writes.push(items.clear(), purchases.clear(), receipts.clear())
    }
    for (const item of data.items) writes.push(items.put(item))
    for (const purchase of data.purchases) writes.push(purchases.put(purchase))
    for (const receipt of data.receipts) writes.push(receipts.put(receipt))

    await Promise.all([...writes, tx.done])
  })
}

export function clearAll(): Promise<void> {
  return guard('데이터를 초기화하지 못했어요.', async () => {
    const db = await getDB()
    const tx = db.transaction(['items', 'purchases', 'receipts'], 'readwrite')
    await Promise.all([
      tx.objectStore('items').clear(),
      tx.objectStore('purchases').clear(),
      tx.objectStore('receipts').clear(),
      tx.done,
    ])
  })
}

/**
 * G2 — 자동 삭제(eviction) 면제를 요청한다.
 *
 * iOS Safari: 홈 화면에 추가하지 않은 사이트는 7일간 방문이 없으면 저장소가 통째로 지워진다.
 * Android Chrome: 7일 타이머는 없지만 기기 저장 공간이 부족하면 사용이 뜸한 origin부터 evict한다.
 * 어느 쪽이든 거부될 수 있으므로, 실패해도 앱은 정상 동작해야 한다. 결과는 설정 화면 배너에 쓴다.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return { usage, quota }
  } catch {
    return null
  }
}
