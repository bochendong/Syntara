export const COURSE_MATERIAL_SPACE_LIMIT_BYTES = 20 * 1024 * 1024;
export const COURSE_MATERIAL_KNOWLEDGE_GRAPH_TAG = '加入知识图谱';

const DB_NAME = 'synatra-course-materials';
const DB_VERSION = 1;
const STORE = 'materials';

export type CourseMaterialListItem = {
  id: string;
  courseId: string;
  name: string;
  mimeType: string;
  size: number;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

type CourseMaterialRecord = CourseMaterialListItem & {
  blob: Blob;
};

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `course-material-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeTags(tags?: unknown): string[] {
  const values = Array.isArray(tags)
    ? tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
  const unique = Array.from(new Set([COURSE_MATERIAL_KNOWLEDGE_GRAPH_TAG, ...values]));
  return unique.slice(0, 8);
}

function withoutBlob(record: CourseMaterialRecord): CourseMaterialListItem {
  const { blob: _blob, ...item } = record;
  return {
    ...item,
    tags: normalizeTags(item.tags),
  };
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('当前浏览器不支持本地资料存储。'));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('courseId', 'courseId', { unique: false });
        store.createIndex('courseIdCreatedAt', ['courseId', 'createdAt'], { unique: false });
      }
    };
  });
}

async function readAllRecords(courseId: string): Promise<CourseMaterialRecord[]> {
  const cid = courseId.trim();
  if (!cid) return [];
  const db = await openDb();
  try {
    return await new Promise<CourseMaterialRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const index = store.index('courseId');
      const req = index.getAll(cid);
      req.onsuccess = () => resolve((req.result ?? []) as CourseMaterialRecord[]);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function listCourseMaterials(courseId: string): Promise<CourseMaterialListItem[]> {
  const records = await readAllRecords(courseId);
  return records
    .map(withoutBlob)
    .sort((a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name));
}

export async function getCourseMaterialsUsageBytes(courseId: string): Promise<number> {
  const records = await readAllRecords(courseId);
  return records.reduce((sum, record) => sum + record.size, 0);
}

export async function addCourseMaterials(
  courseId: string,
  files: File[],
): Promise<CourseMaterialListItem[]> {
  const cid = courseId.trim();
  if (!cid) throw new Error('缺少课程信息，无法保存资料。');
  const selected = files.filter((file) => file.size > 0);
  if (selected.length === 0) return [];

  const usedBytes = await getCourseMaterialsUsageBytes(cid);
  const incomingBytes = selected.reduce((sum, file) => sum + file.size, 0);
  if (usedBytes + incomingBytes > COURSE_MATERIAL_SPACE_LIMIT_BYTES) {
    const remainingMb = Math.max(0, COURSE_MATERIAL_SPACE_LIMIT_BYTES - usedBytes) / 1024 / 1024;
    throw new Error(`课程资料空间最多 20MB，当前剩余 ${remainingMb.toFixed(1)}MB。`);
  }

  const now = Date.now();
  const records: CourseMaterialRecord[] = await Promise.all(
    selected.map(async (file, index) => ({
      id: createId(),
      courseId: cid,
      name: file.name.trim() || `未命名资料 ${index + 1}`,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      tags: [COURSE_MATERIAL_KNOWLEDGE_GRAPH_TAG],
      createdAt: now + index,
      updatedAt: now + index,
      blob: new Blob([await file.arrayBuffer()], {
        type: file.type || 'application/octet-stream',
      }),
    })),
  );

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE);
      records.forEach((record) => store.put(record));
    });
  } finally {
    db.close();
  }
  return records.map(withoutBlob);
}

export async function getCourseMaterialBlob(id: string): Promise<Blob | null> {
  const materialId = id.trim();
  if (!materialId) return null;
  const db = await openDb();
  try {
    const row = await new Promise<CourseMaterialRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(materialId);
      req.onsuccess = () => resolve(req.result as CourseMaterialRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    return row?.blob ?? null;
  } finally {
    db.close();
  }
}

export async function deleteCourseMaterial(id: string): Promise<void> {
  const materialId = id.trim();
  if (!materialId) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(materialId);
    });
  } finally {
    db.close();
  }
}
