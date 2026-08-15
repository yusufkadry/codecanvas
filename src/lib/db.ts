import type { Checkpoint, ModelChoice, ProjectMeta } from "./types";
import type { ChatEntry } from "./store";

/**
 * On-device project history via IndexedDB (localStorage would cap out fast
 * with file snapshots). Nothing here ever leaves the browser — same trust
 * model as the keys.
 */

const DB_NAME = "codecanvas";
const STORE = "projects";

export interface ProjectRecord {
  id: string;
  title: string;
  prompt: string;
  chat: ChatEntry[];
  files: Record<string, string>;
  checkpoints: Checkpoint[];
  lastChoice: ModelChoice | null;
  createdAt: number;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export async function upsertProject(rec: Omit<ProjectRecord, "createdAt">): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const existing = (await reqAsPromise(store.get(rec.id))) as ProjectRecord | undefined;
  store.put({ ...rec, createdAt: existing?.createdAt ?? rec.updatedAt });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
  });
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  return reqAsPromise(tx.objectStore(STORE).get(id)) as Promise<ProjectRecord | undefined>;
}

export async function listProjectMetas(): Promise<ProjectMeta[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const all = (await reqAsPromise(tx.objectStore(STORE).getAll())) as ProjectRecord[];
  return all
    .map((p) => ({
      id: p.id,
      title: p.title,
      updatedAt: p.updatedAt,
      fileCount: Object.keys(p.files ?? {}).length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProjectRecord(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
  });
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(ts).toLocaleDateString();
}
