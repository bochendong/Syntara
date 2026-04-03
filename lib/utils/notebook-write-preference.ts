const STORAGE_KEY = 'synatra-apply-notebook-writes';
const CHANGE_EVENT = 'synatra-apply-notebook-writes-changed';

export function getStoredApplyNotebookWrites(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export function setStoredApplyNotebookWrites(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // ignore
  }
}

/** 其他标签页修改 storage，或同页通过 setStored 触发自定义事件时回调 */
export function subscribeApplyNotebookWrites(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) onChange();
  };
  const onCustom = () => onChange();
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onCustom);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onCustom);
  };
}
