import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { physicalDraftStore } from './store';

const PhysicalContext = createContext<typeof physicalDraftStore | null>(null);
export function PhysicalDraftProvider({ children }: { children: ReactNode }) {
  return <PhysicalContext.Provider value={physicalDraftStore}>{children}</PhysicalContext.Provider>;
}
export function usePhysicalDraft() {
  const store = useContext(PhysicalContext);
  if (!store) throw new Error('Physical draft views must share the selected registry provider.');
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { store.hydrate(); }, [store]);
  return { ...snapshot, store };
}
