/** Local context names are labels, never authorization or encryption. No session
 * credential or account context token is persisted here. */
export const UNASSIGNED_CONTEXT = 'unassigned';
const ACTIVE_KEY = 'modern-floor-planner:working-context:v1';
const VALUES_PREFIX = 'modern-floor-planner:local-fields:v1:';
const states = new Map<string, Record<string, unknown>>();
const failures = new Set<string>();
const checkpoints = new Map<string, Map<string, () => boolean>>();
let active: string | null = UNASSIGNED_CONTEXT;
try {
  const saved = sessionStorage.getItem(ACTIVE_KEY);
  if (saved && (saved === UNASSIGNED_CONTEXT || /^workspace:[^:]+:[^:]+$/.test(saved))) active = saved;
} catch { /* Memory-only local editing remains available. */ }

export const workspaceContext = (principal: string, workspace: string) => `workspace:${principal}:${workspace}`;
export const currentLocalContext = () => active;
export function setLocalContext(context: string | null) {
  active = context;
  // Retain the previous context on lock; it is never automatically shown without
  // matching server verification on the next page load.
  if (context) try { sessionStorage.setItem(ACTIVE_KEY, context); } catch { /* checkpoint reports failure */ }
}
export function contextStorage(context: string) {
  const key = (name: string) => context === UNASSIGNED_CONTEXT ? name : `modern-floor-planner:context:v1:${context}:${name}`;
  return {
    getItem: (name: string) => sessionStorage.getItem(key(name)),
    setItem: (name: string, value: string) => sessionStorage.setItem(key(name), value),
    removeItem: (name: string) => sessionStorage.removeItem(key(name)),
  };
}
export function localValues(context: string): Record<string, unknown> {
  let values = states.get(context);
  if (values) return values;
  values = {};
  try {
    const raw = sessionStorage.getItem(VALUES_PREFIX + context);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 'local-fields-v1' || parsed.context !== context || !parsed.values || Array.isArray(parsed.values) || typeof parsed.values !== 'object') throw Error();
      values = parsed.values;
    }
  } catch { failures.add(context); }
  states.set(context, values!);
  return values!;
}
export function persistLocalValues(context: string): boolean {
  if (failures.has(context)) return false;
  try {
    const raw = JSON.stringify({ version: 'local-fields-v1', context, values: localValues(context) });
    sessionStorage.setItem(VALUES_PREFIX + context, raw);
    return sessionStorage.getItem(VALUES_PREFIX + context) === raw;
  } catch { return false; }
}
export function setLocalValue(context: string, key: string, value: unknown) {
  localValues(context)[key] = value;
}
export function registerCheckpoint(context: string, name: string, checkpoint: () => boolean) {
  let group = checkpoints.get(context);
  if (!group) checkpoints.set(context, group = new Map());
  group.set(name, checkpoint);
  return () => { if (group!.get(name) === checkpoint) group!.delete(name); };
}
/** Synchronous read-back proof before any intentional navigation. A corrupt
 * preserved cache or failed write never becomes permission to leave the page. */
export function checkpointContext(context = active): boolean {
  if (!context) return true;
  if (failures.has(context)) return false;
  for (const checkpoint of Array.from(checkpoints.get(context)?.values() ?? [])) if (!checkpoint()) return false;
  try {
    const raw = JSON.stringify({ version: 'local-fields-v1', context, values: localValues(context) });
    sessionStorage.setItem(VALUES_PREFIX + context, raw);
    sessionStorage.setItem(ACTIVE_KEY, context);
    return sessionStorage.getItem(VALUES_PREFIX + context) === raw && sessionStorage.getItem(ACTIVE_KEY) === context;
  } catch { return false; }
}
