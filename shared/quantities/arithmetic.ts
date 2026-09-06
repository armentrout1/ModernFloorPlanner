import { MAX_QUANTITY_MAGNITUDE, type QuantityTrace } from './result';
import type { ContractError } from './policy';

export class ArithmeticFailure extends Error {
  constructor(readonly detail: ContractError) { super(detail.message); }
}
export function checked(value: number, operation: string): number {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_QUANTITY_MAGNITUDE) {
    throw new ArithmeticFailure({ code: 'ARITHMETIC_RANGE', path: [], message: operation + ' exceeds finite supported magnitude ' + MAX_QUANTITY_MAGNITUDE });
  }
  return Object.is(value, -0) ? 0 : value;
}
function lostOperand(a: number, b: number, result: number, subtraction: boolean) {
  if ((b !== 0 && result === a) || (a !== 0 && result === (subtraction ? -b : b))) {
    throw new ArithmeticFailure({ code: 'ARITHMETIC_PRECISION_LOSS', path: [],
      message: 'A nonzero arithmetic operand was fully absorbed at this numeric magnitude' });
  }
}
export function add(a: number, b: number): number {
  checked(a, 'addition input'); checked(b, 'addition input');
  const result = checked(a + b, 'addition');
  lostOperand(a, b, result, false);
  return result;
}
export function subtract(a: number, b: number): number {
  checked(a, 'subtraction input'); checked(b, 'subtraction input');
  const result = checked(a - b, 'subtraction');
  lostOperand(a, b, result, true);
  return result;
}
export function multiply(a: number, b: number): number {
  checked(a, 'multiplication input'); checked(b, 'multiplication input');
  const result = checked(a * b, 'multiplication');
  if (a !== 0 && b !== 0 && result === 0) {
    throw new ArithmeticFailure({ code: 'ARITHMETIC_UNDERFLOW', path: [], message: 'Nonzero multiplication underflows the supported numeric representation' });
  }
  return result;
}
export const sum = (values: number[]) => values.reduce(add, 0);
export function nonnegative(value: number, operation: string): number {
  checked(value, operation);
  if (value < 0) throw new ArithmeticFailure({ code: 'ARITHMETIC_NEGATIVE_QUANTITY', path: [], message: operation + ' produced a negative quantity' });
  return value;
}
// Arithmetic roundoff is separate from 0.01mm geometry tolerance: it cannot make
// invalid geometry valid. Normalize only overshoot within an explicit ULP bound.
export function limited(value: number, ceiling: number, trace: QuantityTrace, operation: string,
  unit: 'mm' | 'mm2', observedRoundoffBudget = 0): number {
  checked(value, operation); checked(ceiling, operation);
  if (value <= ceiling) return nonnegative(value, operation);
  const difference = subtract(value, ceiling);
  const roundoff = observedRoundoffBudget + Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(ceiling)) * 16;
  if (difference > roundoff) throw new ArithmeticFailure({ code: 'ARITHMETIC_COVERAGE', path: [], message: operation + ' exceeds its geometric coverage bound' });
  trace.adjustments.push({ code: 'FLOATING_POINT_ROUNDOFF', amount: difference, unit,
    message: operation + ' bounded to its coverage limit within recorded coordinate roundoff plus 16 relative machine epsilons' });
  return ceiling;
}
export interface Interval { start: number; end: number }
export interface Rectangle { x: Interval; y: Interval }
// Numeric representation budget, independent of the 0.01mm geometry tolerance.
// Small ordinary coordinate cancellation is recorded; materially shortened spans fail.
export const EXTENT_PRECISION_ABSOLUTE_MM = 1e-9;
export function validateExtent(bounds: Interval, expectedLength: number): Interval {
  const actual = span(bounds);
  const budget = EXTENT_PRECISION_ABSOLUTE_MM + 16 * Number.EPSILON * Math.abs(expectedLength);
  if (actual === 0 || Math.abs(actual - expectedLength) > budget) {
    throw new ArithmeticFailure({ code: 'ARITHMETIC_PRECISION_LOSS', path: [],
      message: 'Coordinate extent does not preserve its measured dimension within 1e-9mm plus 16 relative machine epsilons' });
  }
  return bounds;
}
export function interval(center: number, length: number): Interval {
  checked(center, 'opening offset'); checked(length, 'opening width');
  const half = multiply(length, .5);
  return validateExtent({ start: subtract(center, half), end: add(center, half) }, length);
}
export function elevatedInterval(sill: number, height: number): Interval {
  return validateExtent({ start: checked(sill, 'opening sill'), end: add(sill, height) }, height);
}
export function intersect(source: Interval, limit: number): Interval {
  checked(limit, 'wall bound');
  const start = Math.min(limit, Math.max(0, source.start));
  const end = Math.min(limit, Math.max(0, source.end));
  return { start, end };
}
export const span = (value: Interval) => nonnegative(subtract(value.end, value.start), 'interval span');
export function unionLength(intervals: Interval[]): number {
  const ordered = intervals.filter(value => value.end > value.start).sort((a, b) => a.start - b.start || a.end - b.end);
  let total = 0, current: Interval | undefined;
  for (const item of ordered) {
    if (!current) current = { ...item };
    else if (item.start <= current.end) current.end = Math.max(current.end, item.end);
    else { total = add(total, span(current)); current = { ...item }; }
  }
  return current ? add(total, span(current)) : total;
}
export function unionArea(rectangles: Rectangle[]): number {
  const edges = Array.from(new Set(rectangles.flatMap(rectangle => [rectangle.x.start, rectangle.x.end]))).sort((a, b) => a - b);
  let total = 0;
  for (let index = 1; index < edges.length; index++) {
    const start = edges[index - 1], end = edges[index];
    if (start === end) continue;
    const heights = rectangles.filter(rectangle => rectangle.x.start < end && rectangle.x.end > start).map(rectangle => rectangle.y);
    total = add(total, multiply(subtract(end, start), unionLength(heights)));
  }
  return total;
}
