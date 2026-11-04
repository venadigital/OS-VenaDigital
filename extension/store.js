// Captures waiting for the OS to pick them up. They live in IndexedDB because the service
// worker can stop at any moment and the images don't fit in chrome.storage.
const DB = 'vena-captures';
const MAX_AGE_MS = 60 * 60 * 1000;

let opened = null;
function db() {
  opened ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('meta', { keyPath: 'id' });
      req.result.createObjectStore('parts', { keyPath: ['id', 'index'] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opened;
}

const asPromise = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function tx(stores, mode, work) {
  const t = (await db()).transaction(stores, mode);
  const done = new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  const result = await work(t);
  await done;
  return result;
}

export const saveMeta = (meta) => tx(['meta'], 'readwrite', (t) => asPromise(t.objectStore('meta').put(meta)));
export const savePart = (part) => tx(['parts'], 'readwrite', (t) => asPromise(t.objectStore('parts').put(part)));
export const readMeta = (id) => tx(['meta'], 'readonly', (t) => asPromise(t.objectStore('meta').get(id)));
export const readPart = (id, index) => tx(['parts'], 'readonly', (t) => asPromise(t.objectStore('parts').get([id, index])));

export const removeRecord = (id) =>
  tx(['meta', 'parts'], 'readwrite', (t) => {
    t.objectStore('meta').delete(id);
    t.objectStore('parts').delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
  });

/** What was never picked up doesn't stay on the disk: parts with no meta, or an old meta. */
export async function purgeOld(now = Date.now()) {
  const metas = await tx(['meta'], 'readonly', (t) => asPromise(t.objectStore('meta').getAll()));
  const keep = new Set(metas.filter((m) => now - m.createdAt < MAX_AGE_MS).map((m) => m.id));
  for (const m of metas) if (!keep.has(m.id)) await removeRecord(m.id);
  await tx(['parts'], 'readwrite', (t) => {
    const cursor = t.objectStore('parts').openKeyCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      if (!keep.has(c.primaryKey[0])) t.objectStore('parts').delete(c.primaryKey);
      c.continue();
    };
  });
}
