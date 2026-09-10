import { navigate } from 'wouter/use-browser-location';
import { getPhysicalDraftStore } from '../account/physicalStores';
import { adoptLegacyDraft, adoptQuickDraft, insertDraft, type PhysicalDraft } from './state';
import type { QuickRoomDraft } from '../quick-room/state';

function openCopy(create: () => PhysicalDraft) {
  const physicalDraftStore = getPhysicalDraftStore();
  physicalDraftStore.hydrate();
  const applied = physicalDraftStore.dispatch(registry => insertDraft(registry, create()));
  if (applied) navigate('/physical-draft');
  else window.alert(physicalDraftStore.getSnapshot().error || physicalDraftStore.getSnapshot().message ||
    'The copy could not be opened. Your original and recovery data are unchanged.');
}
// Called only by an explicit user action, never a mount effect or automatic import.
export function openQuickPhysicalCopy(source: QuickRoomDraft) {
  openCopy(() => adoptQuickDraft(source, crypto.randomUUID(), 'Quick Rooms · physical copy'));
}
export function openLegacyPhysicalCopy(source: unknown) {
  openCopy(() => adoptLegacyDraft(source, crypto.randomUUID()));
}
