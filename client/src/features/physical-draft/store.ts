import { createRegistry, updateDraft, type PhysicalDraft, type PhysicalDraftRegistry } from './state';
import { parseRegistry, serializeRegistry, validateRegistry, PHYSICAL_DRAFT_STORAGE_KEY, PREVIOUS_PHYSICAL_DRAFT_STORAGE_KEY, LEGACY_PHYSICAL_DRAFT_STORAGE_KEY } from './storage';

import { emptyHistory, historySummary, recordHistoryCommit, restoreHistory, type DraftHistory, type HistorySummary, type HistoryUpdateOptions } from './history';

export interface DraftStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface PhysicalDraftStoreSnapshot {
  registry: PhysicalDraftRegistry;
  history: HistorySummary;
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
  let recoveryKey = PHYSICAL_DRAFT_STORAGE_KEY;
  let fallbackReads: {key:string;raw:string|null}[] = [];
  const histories = new Map<string, DraftHistory>();
  const currentHistory = (id: string) => histories.get(id) ?? emptyHistory();
  let snapshot: PhysicalDraftStoreSnapshot = { history: historySummary(null, emptyHistory()), registry: freeze(createRegistry()), cache: 'uninitialized', message: '', error: '', rawRecovery: null };
  const listeners = new Set<() => void>();
  const publish = (next: PhysicalDraftStoreSnapshot) => {
    const draft = next.registry.drafts.find(item => item.id === next.registry.selectedDraftId) ?? null;
    snapshot = { ...next, history: freeze(historySummary(draft, draft ? currentHistory(draft.id) : emptyHistory())) };
    listeners.forEach(listener => listener());
  };
  function hydrate(): void {
    if (snapshot.cache !== 'uninitialized') return;
    let raw: string | null;
    try {
      storage = storageFactory(); raw = storage.getItem(PHYSICAL_DRAFT_STORAGE_KEY);
      fallbackReads=[];
      if(raw===null)for(const key of [PREVIOUS_PHYSICAL_DRAFT_STORAGE_KEY,LEGACY_PHYSICAL_DRAFT_STORAGE_KEY]){
        const older=storage.getItem(key);fallbackReads.push({key,raw:older});
        if(older!==null){raw=older;recoveryKey=key;break;}
      }
    }
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
    lastGoodRaw = recoveryKey === PHYSICAL_DRAFT_STORAGE_KEY ? raw : null;
    if (result.status === 'recovered') for (const draft of result.registry.drafts) histories.set(draft.id, emptyHistory('Undo/Redo history starts in this page session. The latest recovered draft and its evidence are preserved.'));
    publish({ ...snapshot, registry: freeze(result.status === 'recovered' ? result.registry : createRegistry()), cache: 'ready',
      message: result.status === 'recovered' ? 'Temporary physical drafts recovered for this browser session.' : '' });
  }
  function dispatch(change: (registry: PhysicalDraftRegistry) => PhysicalDraftRegistry, accepted?: () => void): boolean {
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
      const validated = validateRegistry({ ...candidate, version: 'mfp-editor-draft-v3' });
      if (validated.status !== 'recovered') throw new Error(validated.status === 'empty' ? 'The draft registry is empty.' : validated.message);
      next = freeze(validated.registry);
    } catch (error) {
      publish({ ...snapshot, error: error instanceof Error ? error.message : 'The draft could not be changed.' });
      return false;
    }
    accepted?.();
    let following: PhysicalDraftStoreSnapshot = { ...snapshot, registry: next, error: '' };
    if (snapshot.cache === 'ready' && storage) {
      try {
        const current = storage.getItem(PHYSICAL_DRAFT_STORAGE_KEY);
        const changedFallback=fallbackReads.map(item=>({...item,current:storage!.getItem(item.key)})).find(item=>item.current!==item.raw);
        if (current !== lastGoodRaw || changedFallback) {
          following = { ...following, cache: 'conflict', rawRecovery: current ?? changedFallback?.current ?? null,
            message: 'Recovery data changed in another editor. This edit is held in memory; the newer stored draft has not been overwritten.' };
        } else {
          const raw = serializeRegistry(next);
          storage.setItem(PHYSICAL_DRAFT_STORAGE_KEY, raw);
          lastGoodRaw = raw;
          fallbackReads=[]; recoveryKey = PHYSICAL_DRAFT_STORAGE_KEY;
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
      activeStorage.removeItem(recoveryKey);
      storage = activeStorage;
      lastGoodRaw = null;
      fallbackReads=[]; recoveryKey = PHYSICAL_DRAFT_STORAGE_KEY;
      histories.clear();
      publish({ history: historySummary(null, emptyHistory()), registry: freeze(createRegistry()), cache: 'ready', message: '', error: '', rawRecovery: null });
      return true;
    } catch {
      publish({ ...snapshot, error: 'Recovery data could not be discarded. The current draft and stored contents are unchanged.' });
      return false;
    }
  }
  function replay(id: string, revision: number, direction: 'undo' | 'redo', at: string): boolean {
    let acceptedHistory: DraftHistory | undefined;
    return dispatch(registry => updateDraft(registry, id, revision, draft => {
      const prepared = restoreHistory(draft, currentHistory(id), direction, at);
      acceptedHistory = prepared.history;
      return prepared.draft;
    }), () => { if (acceptedHistory) histories.set(id, acceptedHistory); });
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hydrate, dispatch, discardRecovery,
    updateDraft: (id: string, expectedRevision: number, change: (draft: PhysicalDraft) => PhysicalDraft, options: HistoryUpdateOptions = {}): boolean => {
      let acceptedHistory: DraftHistory | undefined;
      return dispatch(registry => updateDraft(registry, id, expectedRevision, before => {
        const after = change(before);
        const prepared = recordHistoryCommit(before, after, currentHistory(id), options);
        acceptedHistory = prepared.history;
        return prepared.draft;
      }), () => { if (acceptedHistory) histories.set(id, acceptedHistory); });
    },
    undo: (id: string, expectedRevision: number, at: string): boolean => replay(id, expectedRevision, 'undo', at),
    redo: (id: string, expectedRevision: number, at: string): boolean => replay(id, expectedRevision, 'redo', at),
  };
}
export const physicalDraftStore = createPhysicalDraftStore();
