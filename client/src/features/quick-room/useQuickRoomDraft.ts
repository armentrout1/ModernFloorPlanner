import { useEffect, useRef, useState } from 'react';
import { contextStorage, registerCheckpoint, currentLocalContext } from '../account/localContexts';
import { useLocalEditorContext } from '../account/useLocalState';
import { createDraft, type QuickRoomDraft } from './state';
import { parseDraft, serializeDraft, QUICK_ROOM_STORAGE_KEY } from './storage';

type CacheState = 'ready' | 'unavailable' | 'corrupt' | 'unsupported';
interface DraftSession { draft: QuickRoomDraft; cache: CacheState; message: string }
const sessions = new Map<string, DraftSession>();
const knownRaw = new Map<string, string | null>();
function initialSession(context: string): DraftSession {
  try {
    const raw = contextStorage(context).getItem(QUICK_ROOM_STORAGE_KEY);
    knownRaw.set(context, raw);
    const loaded = parseDraft(raw);
    if (loaded.status === 'recovered') return { draft: loaded.draft, cache: 'ready', message: '' };
    if (loaded.status === 'empty') return { draft: createDraft(), cache: 'ready', message: '' };
    return { draft: createDraft(), cache: loaded.status, message: loaded.message };
  } catch {
    return { draft: createDraft(), cache: 'unavailable', message: 'Browser tab storage is not accessible.' };
  }
}

/** All writes are synchronous event work, outside React state updater callbacks.
 * Failed reads never authorize overwriting a cache; failed writes retain live input.
 */
export function useQuickRoomDraft() {
  const context = useLocalEditorContext();
  const [session, setSession] = useState(() => { const loaded = sessions.get(context) ?? initialSession(context); sessions.set(context, loaded); return loaded; });
  const current = useRef(session);
  useEffect(() => registerCheckpoint(context, 'quick', () => {
    if (['corrupt','unsupported'].includes(current.current.cache) || !knownRaw.has(context)) return false;
    try {
      if (contextStorage(context).getItem(QUICK_ROOM_STORAGE_KEY) !== knownRaw.get(context)) return false;
      const raw = serializeDraft(current.current.draft);
      contextStorage(context).setItem(QUICK_ROOM_STORAGE_KEY, raw);
      knownRaw.set(context, raw);
      return contextStorage(context).getItem(QUICK_ROOM_STORAGE_KEY) === raw;
    } catch { return false; }
  }), [context]);
  const [error, setError] = useState('');
  const replace = (next: DraftSession) => { current.current = next; sessions.set(context, next); setSession(next); };
  function update(change: (draft: QuickRoomDraft) => QuickRoomDraft) {
    if (currentLocalContext() !== context) return;
    if (['corrupt', 'unsupported'].includes(current.current.cache)) return;
    try {
      const nextDraft = change(current.current.draft);
      if (nextDraft === current.current.draft) return;
      const next = { ...current.current, draft: nextDraft };
      if (next.cache === 'ready') {
        try { const raw = serializeDraft(nextDraft); contextStorage(context).setItem(QUICK_ROOM_STORAGE_KEY, raw); knownRaw.set(context, raw); }
        catch { next.cache = 'unavailable'; next.message = 'The latest changes could not be cached in this browser tab.'; }
      }
      replace(next);
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'This room could not be changed safely.');
    }
  }
  function discard() {
    if (!window.confirm('Discard only the Quick Rooms draft in this browser tab? Your sketch is separate.')) return;
    try {
      contextStorage(context).removeItem(QUICK_ROOM_STORAGE_KEY); knownRaw.set(context, null);
      replace({ draft: createDraft(), cache: 'ready', message: '' });
      setError('');
    } catch {
      setError('The cached draft could not be removed. Your current draft is retained.');
    }
  }
  return { ...session, error, update, discard, blocked: session.cache === 'corrupt' || session.cache === 'unsupported' };
}
