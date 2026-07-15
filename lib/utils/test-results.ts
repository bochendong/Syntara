'use client';

import { backendJson } from '@/lib/utils/backend-api';

export interface TestResultSummary {
  generatedCount?: number;
  errorCount?: number;
  lastUpdatedAt?: number | string | null;
  [key: string]: unknown;
}

export interface TestResultRow<TPayload = unknown> {
  id: string;
  testId: string;
  resultKey: string;
  status: string;
  title: string | null;
  summary: TestResultSummary | null;
  payload?: TPayload;
  payloadBytes: number;
  createdAt: string;
  updatedAt: string;
  storage?: 'browser' | 'shared';
  canDelete?: boolean;
  syncPending?: boolean;
}

interface SharedTestResultsResponse<TPayload = unknown> {
  success?: boolean;
  results?: TestResultRow<TPayload>[];
}

interface SharedTestResultResponse<TPayload = unknown> {
  success?: boolean;
  result?: TestResultRow<TPayload> | null;
}

type LocalTestResultRow<TPayload = unknown> = TestResultRow<TPayload> & {
  localKey: string;
  ownerId: string;
};

export interface LocalTestFileRow {
  id: string;
  testId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  lastModified: number;
  uploadedAt: string;
}

type StoredLocalTestFileRow = LocalTestFileRow & {
  ownerId: string;
  blob: Blob;
};

const LOCAL_DATABASE_NAME = 'syntara-test-results';
const LOCAL_DATABASE_VERSION = 2;
const LOCAL_RESULT_STORE_NAME = 'results';
const LOCAL_FILE_STORE_NAME = 'files';

let persistenceRequest: Promise<void> | null = null;

function requestPersistentBrowserStorage(): Promise<void> {
  if (persistenceRequest) return persistenceRequest;
  persistenceRequest = (async () => {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
    try {
      await navigator.storage.persist();
    } catch {
      // IndexedDB remains durable across normal refreshes and browser restarts even if
      // the browser does not grant the stronger non-eviction persistence mode.
    }
  })();
  return persistenceRequest;
}

function readLocalOwnerId(): string {
  if (typeof window === 'undefined') return 'user-anonymous';
  try {
    const raw = window.localStorage.getItem('synatra-auth');
    if (!raw) return 'user-anonymous';
    const parsed = JSON.parse(raw) as { state?: { userId?: string } };
    return parsed.state?.userId?.trim() || 'user-anonymous';
  } catch {
    return 'user-anonymous';
  }
}

function localResultKey(ownerId: string, testId: string, resultKey: string): string {
  return JSON.stringify([ownerId, testId, resultKey]);
}

function openLocalDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('当前浏览器不支持测试结果本地持久化。'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DATABASE_NAME, LOCAL_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LOCAL_RESULT_STORE_NAME)) {
        const store = database.createObjectStore(LOCAL_RESULT_STORE_NAME, {
          keyPath: 'localKey',
        });
        store.createIndex('ownerId', 'ownerId', { unique: false });
        store.createIndex('testId', 'testId', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!database.objectStoreNames.contains(LOCAL_FILE_STORE_NAME)) {
        const store = database.createObjectStore(LOCAL_FILE_STORE_NAME, { keyPath: 'id' });
        store.createIndex('ownerId', 'ownerId', { unique: false });
        store.createIndex('testId', 'testId', { unique: false });
        store.createIndex('uploadedAt', 'uploadedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('测试结果本地数据库打开失败。'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error('测试结果本地数据库写入失败。'));
    transaction.onabort = () =>
      reject(transaction.error || new Error('测试结果本地数据库事务已取消。'));
  });
}

async function putLocalResult<TPayload>(row: TestResultRow<TPayload>): Promise<void> {
  const ownerId = readLocalOwnerId();
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(LOCAL_RESULT_STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(LOCAL_RESULT_STORE_NAME);
    const key = localResultKey(ownerId, row.testId, row.resultKey);
    const existingRequest = store.get(key);
    const existing = await new Promise<LocalTestResultRow<TPayload> | undefined>(
      (resolve, reject) => {
        existingRequest.onsuccess = () =>
          resolve(existingRequest.result as LocalTestResultRow<TPayload> | undefined);
        existingRequest.onerror = () => reject(existingRequest.error);
      },
    );
    store.put({
      ...existing,
      ...row,
      payload: row.payload === undefined ? existing?.payload : row.payload,
      localKey: key,
      ownerId,
    } satisfies LocalTestResultRow<TPayload>);
    await done;
  } finally {
    database.close();
  }
}

async function listLocalResults<TPayload>(args: {
  testIds?: string[];
  testId?: string;
  resultKey?: string;
  limit?: number;
  allOwners?: boolean;
}): Promise<TestResultRow<TPayload>[]> {
  const ownerId = readLocalOwnerId();
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(LOCAL_RESULT_STORE_NAME, 'readonly');
    const store = transaction.objectStore(LOCAL_RESULT_STORE_NAME);
    const request = args.allOwners ? store.getAll() : store.index('ownerId').getAll(ownerId);
    const rows = await new Promise<LocalTestResultRow<TPayload>[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as LocalTestResultRow<TPayload>[]);
      request.onerror = () => reject(request.error);
    });
    const testIdSet = args.testIds?.length ? new Set(args.testIds) : null;
    return rows
      .filter((row) => {
        if (args.testId && row.testId !== args.testId) return false;
        if (testIdSet && !testIdSet.has(row.testId)) return false;
        if (args.resultKey && row.resultKey !== args.resultKey) return false;
        return true;
      })
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, args.limit || 80)
      .map(({ localKey: _localKey, ownerId: _ownerId, ...row }) => row);
  } finally {
    database.close();
  }
}

export function createTestResultKey(prefix = 'run'): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}-${Date.now()}-${suffix}`;
}

export async function listTestResults<TPayload = unknown>(args: {
  testIds?: string[];
  testId?: string;
  resultKey?: string;
  includePayload?: boolean;
  limit?: number;
  signal?: AbortSignal;
}): Promise<TestResultRow<TPayload>[]> {
  if (args.signal?.aborted) throw new DOMException('操作已取消。', 'AbortError');
  const rows = await listLocalResults<TPayload>(args);
  return rows.map((row) => ({
    ...row,
    storage: 'browser',
    syncPending: false,
  }));
}

export async function loadTestResult<TPayload = unknown>(args: {
  testId: string;
  resultKey: string;
  signal?: AbortSignal;
}): Promise<TestResultRow<TPayload> | null> {
  const rows = await listTestResults<TPayload>({
    testId: args.testId,
    resultKey: args.resultKey,
    includePayload: true,
    limit: 1,
    signal: args.signal,
  });
  return rows[0] || null;
}

export async function listSharedQuestionSourceResults<TPayload = unknown>(args?: {
  signal?: AbortSignal;
}): Promise<TestResultRow<TPayload>[]> {
  const data = await backendJson<SharedTestResultsResponse<TPayload>>(
    '/api/platform-tests/question-source-results',
    { cache: 'no-store', signal: args?.signal },
  );
  return (data.results || []).map((row) => ({
    ...row,
    storage: 'shared',
    syncPending: false,
  }));
}

export async function listAllLocalQuestionSourceResultsForMigration<TPayload = unknown>(): Promise<
  TestResultRow<TPayload>[]
> {
  return listLocalResults<TPayload>({
    testId: 'question-source-routing',
    limit: 200,
    allOwners: true,
  });
}

export async function saveSharedQuestionSourceResult<TPayload = unknown>(args: {
  testId: 'question-source-routing';
  resultKey: string;
  status?: string;
  title?: string;
  summary?: TestResultSummary;
  payload: TPayload;
}): Promise<TestResultRow<TPayload> | null> {
  const data = await backendJson<SharedTestResultResponse<TPayload>>(
    '/api/platform-tests/question-source-results',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        testId: args.testId,
        resultKey: args.resultKey,
        status: args.status || 'saved',
        title: args.title,
        summary: args.summary,
        payload: args.payload,
      }),
    },
  );
  return data.result || null;
}

export async function deleteSharedQuestionSourceResult(args: {
  testId: 'question-source-routing';
  resultKey: string;
}): Promise<void> {
  await backendJson('/api/platform-tests/question-source-results', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
}

export async function saveTestResult<TPayload = unknown>(args: {
  testId: string;
  resultKey: string;
  status?: string;
  title?: string;
  summary?: TestResultSummary;
  payload: TPayload;
}): Promise<TestResultRow | null> {
  await requestPersistentBrowserStorage();
  const timestamp = new Date().toISOString();
  const localRow: TestResultRow<TPayload> = {
    id: `local-${args.resultKey}`,
    testId: args.testId,
    resultKey: args.resultKey,
    status: args.status || 'saved',
    title: args.title || null,
    summary: args.summary || null,
    payload: args.payload,
    payloadBytes: new TextEncoder().encode(JSON.stringify(args.payload) ?? 'null').length,
    createdAt: timestamp,
    updatedAt: timestamp,
    storage: 'browser',
    syncPending: false,
  };
  await putLocalResult(localRow);
  return localRow;
}

export async function deleteTestResult(args: { testId: string; resultKey: string }): Promise<void> {
  const ownerId = readLocalOwnerId();
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(LOCAL_RESULT_STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    transaction
      .objectStore(LOCAL_RESULT_STORE_NAME)
      .delete(localResultKey(ownerId, args.testId, args.resultKey));
    await done;
  } finally {
    database.close();
  }
}

export async function saveLocalTestFile(args: {
  testId: string;
  file: File;
}): Promise<LocalTestFileRow> {
  await requestPersistentBrowserStorage();
  const ownerId = readLocalOwnerId();
  const uploadedAt = new Date().toISOString();
  const id = createTestResultKey('file');
  const row: StoredLocalTestFileRow = {
    id,
    ownerId,
    testId: args.testId,
    fileName: args.file.name,
    fileType: args.file.type,
    fileSize: args.file.size,
    lastModified: args.file.lastModified,
    uploadedAt,
    blob: args.file,
  };
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(LOCAL_FILE_STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(LOCAL_FILE_STORE_NAME).put(row);
    await done;
  } finally {
    database.close();
  }
  const { ownerId: _ownerId, blob: _blob, ...metadata } = row;
  return metadata;
}

export async function listLocalTestFiles(args: {
  testId: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<LocalTestFileRow[]> {
  if (args.signal?.aborted) throw new DOMException('操作已取消。', 'AbortError');
  const ownerId = readLocalOwnerId();
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(LOCAL_FILE_STORE_NAME, 'readonly');
    const request = transaction.objectStore(LOCAL_FILE_STORE_NAME).index('ownerId').getAll(ownerId);
    const rows = await new Promise<StoredLocalTestFileRow[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredLocalTestFileRow[]);
      request.onerror = () => reject(request.error);
    });
    return rows
      .filter((row) => row.testId === args.testId)
      .sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt))
      .slice(0, args.limit || 40)
      .map(({ ownerId: _ownerId, blob: _blob, ...metadata }) => metadata);
  } finally {
    database.close();
  }
}

export async function loadLocalTestFile(id: string): Promise<File | null> {
  const ownerId = readLocalOwnerId();
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(LOCAL_FILE_STORE_NAME, 'readonly');
    const request = transaction.objectStore(LOCAL_FILE_STORE_NAME).get(id);
    const row = await new Promise<StoredLocalTestFileRow | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredLocalTestFileRow | undefined);
      request.onerror = () => reject(request.error);
    });
    if (!row || row.ownerId !== ownerId) return null;
    return new File([row.blob], row.fileName, {
      type: row.fileType,
      lastModified: row.lastModified,
    });
  } finally {
    database.close();
  }
}
