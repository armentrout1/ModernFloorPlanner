/** Only owned copies are frozen; caller data is never frozen or mutated. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T
  : T extends readonly (infer U)[] ? readonly DeepReadonly<U>[]
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

function freezeOwned<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeOwned(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

export function ownFrozen<T>(input: T): DeepReadonly<T> {
  return freezeOwned(structuredClone(input));
}
