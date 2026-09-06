export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Finite, acyclic, plain JSON. Reject silent JSON.stringify omissions/coercions.
 * Own "__proto__" keys survive; accessors, sparse arrays and exotic objects do not.
 */
export function copyJson(input: unknown): JsonValue {
  const ancestors = new Set<object>();
  function copy(value: unknown, depth: number): JsonValue {
    if (depth > 100) throw new Error('JSON_DEPTH_EXCEEDED');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || ancestors.has(value)) throw new Error('INVALID_JSON');
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    if (!array && prototype !== Object.prototype && prototype !== null) throw new Error('INVALID_JSON_OBJECT');
    if (Object.getOwnPropertySymbols(value).length) throw new Error('INVALID_JSON_SYMBOL');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors).filter(key => !(array && key === 'length'));
    if (keys.some(key => !('value' in descriptors[key]) || !descriptors[key].enumerable)) throw new Error('INVALID_JSON_PROPERTY');
    ancestors.add(value);
    let result: JsonValue;
    if (array) {
      if (keys.length !== value.length || keys.some((key, i) => key !== String(i))) throw new Error('INVALID_JSON_ARRAY');
      result = Array.from({ length: value.length }, (_, i) => copy(descriptors[String(i)].value, depth + 1));
    } else result = Object.fromEntries(keys.map(key => [key, copy(descriptors[key].value, depth + 1)]));
    ancestors.delete(value);
    return result;
  }
  return copy(input, 0);
}

/** mfp-json-v1, not RFC 8785: UTF-16 code-unit sorted object keys; array order
 * retained; ECMAScript JSON string/finite-number encoding, with -0 encoded as 0.
 * No locale, clock or random state participates.
 */
export function canonicalJson(input: unknown): string {
  const value = copyJson(input);
  function serialize(item: JsonValue): string {
    if (item === null || typeof item !== 'object') return JSON.stringify(item);
    if (Array.isArray(item)) return '[' + item.map(serialize).join(',') + ']';
    return '{' + Object.keys(item).sort().map(key => JSON.stringify(key) + ':' + serialize(item[key])).join(',') + '}';
  }
  return serialize(value);
}
