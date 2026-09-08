import { useRef, useState } from 'react';
import { createDraft, type QuickRoomDraft } from './state';
import { parseDraft, serializeDraft, QUICK_ROOM_STORAGE_KEY } from './storage';

type CacheState = 'ready' | 'unavailable' | 'corrupt' | 'unsupported';
interface DraftSession { draft: QuickRoomDraft; cache: CacheState; message: string }
function initialSession(): DraftSession {
  try {
    const loaded = parseDraft(window.sessionStorage.getItem(QUICK_ROOM_STORAGE_KEY));
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
  const [session, setSession] = useState(initialSession);
  const current = useRef(session);
  const [error, setError] = useState('');
  const replace = (next: DraftSession) => { current.current = next; setSession(next); };
  function update(change: (draft: QuickRoomDraft) => QuickRoomDraft) {
    if (['corrupt', 'unsupported'].includes(current.current.cache)) return;
    try {
      const nextDraft = change(current.current.draft);
      if (nextDraft === current.current.draft) return;
      const next = { ...current.current, draft: nextDraft };
      if (next.cache === 'ready') {
        try { window.sessionStorage.setItem(QUICK_ROOM_STORAGE_KEY, serializeDraft(nextDraft)); }
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
      window.sessionStorage.removeItem(QUICK_ROOM_STORAGE_KEY);
      replace({ draft: createDraft(), cache: 'ready', message: '' });
      setError('');
    } catch {
      setError('The cached draft could not be removed. Your current draft is retained.');
    }
  }
  return { ...session, error, update, discard, blocked: session.cache === 'corrupt' || session.cache === 'unsupported' };
}
