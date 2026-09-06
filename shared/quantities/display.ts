import { z } from 'zod';
import { fromMm, fromMm2, mmSchema, mm2Schema, lengthUnitSchema } from '../domain/units';

const inputSchema = z.object({
  value: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
  unit: z.enum(['mm', 'mm2', 'count']),
}).strict();
const displaySchema = z.object({
  unit: z.union([lengthUnitSchema, z.literal('count')]),
  fractionDigits: z.number().int().min(0).max(12),
}).strict();

/** Presentation boundary only. The engine never reads formatted strings. */
export function formatQuantity(input: unknown, display: unknown) {
  const quantity = inputSchema.safeParse(input), options = displaySchema.safeParse(display);
  if (!quantity.success || !options.success) return { ok: false as const, code: 'INVALID_QUANTITY_DISPLAY' };
  const { value, unit } = quantity.data, { unit: target, fractionDigits } = options.data;
  if ((unit === 'count') !== (target === 'count') || (unit === 'count' && (!Number.isSafeInteger(value) || fractionDigits !== 0))) {
    return { ok: false as const, code: 'INCOMPATIBLE_DISPLAY_UNIT' };
  }
  const converted = target === 'count' ? value : unit === 'mm2'
    ? fromMm2(mm2Schema.parse(value), target) : fromMm(mmSchema.parse(value), target);
  return { ok: true as const, formatted: converted.toFixed(fractionDigits),
    unitLabel: unit === 'mm2' ? target + '2' : target, fractionDigits };
}
