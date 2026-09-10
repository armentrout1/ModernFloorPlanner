import { createPhysicalDraftStore, physicalDraftStore } from '../physical-draft/store';
import { contextStorage, currentLocalContext, registerCheckpoint, UNASSIGNED_CONTEXT } from './localContexts';
import { accountStore } from './runtime';
const guarded = new Map<string, ReturnType<typeof createPhysicalDraftStore>>();
const stores = new Map<string, ReturnType<typeof createPhysicalDraftStore>>([[UNASSIGNED_CONTEXT, physicalDraftStore]]);
export function getPhysicalDraftStore(context = currentLocalContext()) {
  if (!context) throw Error('Choose a local working context before opening a draft.');
  let store = stores.get(context);
  if (!store) { store = createPhysicalDraftStore(() => contextStorage(context)); stores.set(context, store); }
  registerCheckpoint(context, 'physical', store.checkpoint);
  let wrapper = guarded.get(context);
  if (!wrapper) {
    const owned = store;
    const editable = () => currentLocalContext() === context && !accountStore.getSnapshot().checking;
    wrapper = { ...owned,
      dispatch: (...args) => editable() && owned.dispatch(...args),
      updateDraft: (...args) => editable() && owned.updateDraft(...args),
      undo: (...args) => editable() && owned.undo(...args),
      redo: (...args) => editable() && owned.redo(...args),
      discardRecovery: () => editable() && owned.discardRecovery(),
    };
    guarded.set(context, wrapper);
  }
  return wrapper;
}
