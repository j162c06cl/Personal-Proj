// Minimal promise wrapper around IndexedDB. Two object stores:
//   "kv"    — user data (portfolio, watchlists, settings)
//   "cache" — data-layer cache entries, safe to wipe at any time
// Falls back to an in-memory map when IndexedDB is unavailable (SSR, private mode).

export type StoreName = "kv" | "cache";

const DB_NAME = "investor-research";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory: Record<StoreName, Map<string, unknown>> = { kv: new Map(), cache: new Map() };

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        if (!db) return reject(new Error("no-idb"));
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      })
  );
}

export async function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>(store, "readonly", (s) => s.get(key));
  } catch {
    return memory[store].get(key) as T | undefined;
  }
}

export async function dbSet<T>(store: StoreName, key: string, value: T): Promise<void> {
  try {
    await run(store, "readwrite", (s) => s.put(value, key));
  } catch {
    memory[store].set(key, value);
  }
}

export async function dbDelete(store: StoreName, key: string): Promise<void> {
  try {
    await run(store, "readwrite", (s) => s.delete(key));
  } catch {
    memory[store].delete(key);
  }
}

export async function dbKeys(store: StoreName): Promise<string[]> {
  try {
    return (await run<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys())).map(String);
  } catch {
    return Array.from(memory[store].keys());
  }
}

export async function dbClear(store: StoreName): Promise<void> {
  try {
    await run(store, "readwrite", (s) => s.clear());
  } catch {
    memory[store].clear();
  }
}
