// IndexedDB home for the backup file handle (FileSystemFileHandle is structured-cloneable).
// Database `piano-practice` v1, object store `backup`, key `file`. Every failure rejects.
// Nothing opens at construction, so building the store is safe anywhere.
import type { BackupHandle, HandleStore } from './controller'

const DB = 'piano-practice'
const STORE = 'backup'
const KEY = 'file'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onblocked = () => reject(new Error('IndexedDB open blocked'))
  })
}

async function run<T>(
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = op(tx.objectStore(STORE))
      let result: T
      req.onsuccess = () => {
        result = req.result
      }
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
  } finally {
    db.close()
  }
}

export function idbHandleStore(): HandleStore {
  return {
    async get() {
      const v = await run('readonly', (s) => s.get(KEY))
      return (v as BackupHandle | undefined) ?? null
    },
    async set(h) {
      await run('readwrite', (s) => s.put(h, KEY))
    },
    async clear() {
      await run('readwrite', (s) => s.delete(KEY))
    },
  }
}
