let databasePromise: Promise<IDBDatabase> | null = null;

export function openEchowaveDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('echowave', 1);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files');
        }
      };
    });
  }
  return databasePromise;
}

export async function getFileFromStore(store: IDBObjectStore, key: IDBValidKey): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => {
      resolve(request.result ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to read from IndexedDB'));
  });
}
