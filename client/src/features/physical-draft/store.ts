import { createRegistry, updateDraft, type PhysicalDraft, type PhysicalDraftRegistry } from './state';
import { parseRegistry, serializeRegistry, validateRegistry, PHYSICAL_DRAFT_STORAGE_KEY } from './storage';

export interface DraftStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface PhysicalDraftStoreSnapshot {
  registry: PhysicalDraftRegistry;
  cache: 'uninitialized' | 'ready' | 'corrupt' | 'unsupported' | 'unavailable' | 'conflict';
  message: string;
  error: string;
  rawRecovery: string | null;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

/** Lazy, session-only storage. Never reads or modifies either legacy editor cache. */
export function createPhysicalDraftStore(storageFactory: () => DraftStorage = () => window.sessionStorage) {
  let storage: DraftStorage | null = null, lastGoodRaw: string | null = null;
  let snapshot: PhysicalDraftStoreSnapshot = { registry: freeze(createRegistry()), cache: 'uninitialized', message: '', error: '', rawRecovery: null };
  const listeners = new Set<() => void>();
  const publish = (next: PhysicalDraftStoreSnapshot) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  function hydrate(): void {
    if (snapshot.cache !== 'uninitialized') return;
    let raw: string | null;
    try { storage = storageFactory(); raw = storage.getItem(PHYSICAL_DRAFT_STORAGE_KEY); }
    catch {
      storage = null;
      publish({ ...snapshot, cache: 'unavailable', message: 'Temporary recovery storage is unavailable. Keep this page open; edits are held only in memory.' });
      return;
    }
    const result = parseRegistry(raw);
    if (result.status === 'corrupt' || result.status === 'unsupported') {
      publish({ ...snapshot, cache: result.status, message: result.message, rawRecovery: raw });
      return;
    }
    lastGoodRaw = raw;
    publish({ ...snapshot, registry: freeze(result.status === 'recovered' ? result.registry : createRegistry()), cache: 'ready',
      message: result.status === 'recovered' ? 'Temporary physical drafts recovered for this browser session.' : '' });
  }
  function dispatch(change: (registry: PhysicalDraftRegistry) => PhysicalDraftRegistry): boolean {
    hydrate();
    if (snapshot.cache === 'corrupt' || snapshot.cache === 'unsupported') {
      publish({ ...snapshot, error: 'Preserved recovery data must be explicitly discarded before starting or adopting another draft.' });
      return false;
    }
    let next: PhysicalDraftRegistry;
    try {
      const candidate = change(snapshot.registry);
      if (candidate === snapshot.registry) { if (snapshot.error) publish({ ...snapshot, error: '' }); return true; }
      if (candidate.localEditRevision !== snapshot.registry.localEditRevision + 1) throw new Error('A registry change must advance exactly one local edit revision.');
      const validated = validateRegistry(candidate);
      if (validated.status !== 'recovered') throw new Error(validated.status === 'empty' ? 'The draft registry is empty.' : validated.message);
      next = freeze(validated.registry);
    } catch (error) {
      publish({ ...snapshot, error: error instanceof Error ? error.message : 'The draft could not be changed.' });
      return false;
    }
    let following: PhysicalDraftStoreSnapshot = { ...snapshot, registry: next, error: '' };
    if (snapshot.cache === 'ready' && storage) {
      try {
        const current = storage.getItem(PHYSICAL_DRAFT_STORAGE_KEY);
        if (current !== lastGoodRaw) {
          following = { ...following, cache: 'conflict', rawRecovery: current,
            message: 'Recovery data changed in another editor. This edit is held in memory; the newer stored draft has not been overwritten.' };
        } else {
          const raw = serializeRegistry(next);
          storage.setItem(PHYSICAL_DRAFT_STORAGE_KEY, raw);
          lastGoodRaw = raw;
        }
      } catch {
        following = { ...following, cache: 'unavailable',
          message: 'This edit is held in memory because temporary recovery could not be saved. Existing stored data has not been cleared.' };
      }
    }
    publish(following);
    return true;
  }
  function discardRecovery(): boolean {
    hydrate();
    try {
      const activeStorage = storage ?? storageFactory();
      activeStorage.removeItem(PHYSICAL_DRAFT_STORAGE_KEY);
      storage = activeStorage;
      lastGoodRaw = null;
      publish({ registry: freeze(createRegistry()), cache: 'ready', message: '', error: '', rawRecovery: null });
      return true;
    } catch {
      publish({ ...snapshot, error: 'Recovery data could not be discarded. The current draft and stored contents are unchanged.' });
      return false;
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hydrate, dispatch, discardRecovery,
    updateDraft: (id: string, expectedRevision: number, change: (draft: PhysicalDraft) => PhysicalDraft): boolean =>
      dispatch(registry => updateDraft(registry, id, expectedRevision, change)),
  };
}
export const physicalDraftStore = createPhysicalDraftStore();
