import type { ChatMessageMetadata } from '@/lib/types/chat';

const DB_NAME = 'synatra-chat-attachments';
const DB_VERSION = 1;
const STORE = 'blobs';

type BlobRecord = { id: string; blob: Blob };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
  });
}

/** 发送消息时写入；与快照里的 attachment.id 对应 */
export async function storeChatAttachmentBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({ id, blob } satisfies BlobRecord);
    });
  } finally {
    db.close();
  }
}

export async function getChatAttachmentBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    const row = await new Promise<BlobRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return row?.blob ?? null;
  } finally {
    db.close();
  }
}

export async function deleteChatAttachmentBlob(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(id);
    });
  } finally {
    db.close();
  }
}

/** 从 IndexedDB 补回 objectUrl，供历史消息再次打开附件 */
export async function hydrateMetadataAttachments(
  attachments: ChatMessageMetadata['attachments'] | undefined,
): Promise<ChatMessageMetadata['attachments'] | undefined> {
  if (!attachments?.length) return attachments;
  const next = await Promise.all(
    attachments.map(async (a) => {
      if (a.objectUrl) return a;
      try {
        const blob = await getChatAttachmentBlob(a.id);
        return blob ? { ...a, objectUrl: URL.createObjectURL(blob) } : a;
      } catch {
        return a;
      }
    }),
  );
  return next;
}
