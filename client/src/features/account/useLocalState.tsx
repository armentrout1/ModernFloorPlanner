import { createContext, useContext, useState, type Dispatch, type SetStateAction } from 'react';
import { localValues, setLocalValue, persistLocalValues, currentLocalContext, UNASSIGNED_CONTEXT } from './localContexts';
export const LocalEditorContext = createContext(UNASSIGNED_CONTEXT);
export const useLocalEditorContext = () => useContext(LocalEditorContext);
/** Values are retained synchronously before React renders or an account control
 * moves focus. Checkpoint serialization is explicit, and never commits a field. */
export function useLocalState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const context = useLocalEditorContext();
  const values = localValues(context);
  const [value, render] = useState<T>(() => {
    if (Object.prototype.hasOwnProperty.call(values, key)) return values[key] as T;
    const next = typeof initial === 'function' ? (initial as () => T)() : initial;
    setLocalValue(context, key, next); return next;
  });
  const update: Dispatch<SetStateAction<T>> = change => {
    if (currentLocalContext() !== context) return;
    const before = localValues(context)[key] as T;
    const next = typeof change === 'function' ? (change as (previous: T) => T)(before) : change;
    setLocalValue(context, key, next); persistLocalValues(context); render(next);
  };
  return [value, update];
}

// Presentation survives same-page account-context remounts, but keeps the
// editor's original fresh-page defaults. It is not part of recovery storage.
const transientValues = new Map<string, Record<string, unknown>>();
export function useTransientLocalState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const context = useLocalEditorContext();
  let values = transientValues.get(context);
  if (!values) { values = {}; transientValues.set(context, values); }
  const retained = values;
  const [value, render] = useState<T>(() => {
    if (Object.prototype.hasOwnProperty.call(retained, key)) return retained[key] as T;
    const next = typeof initial === 'function' ? (initial as () => T)() : initial;
    retained[key] = next; return next;
  });
  const update: Dispatch<SetStateAction<T>> = change => {
    if (currentLocalContext() !== context) return;
    const before = retained[key] as T;
    const next = typeof change === 'function' ? (change as (previous: T) => T)(before) : change;
    retained[key] = next; render(next);
  };
  return [value, update];
}
