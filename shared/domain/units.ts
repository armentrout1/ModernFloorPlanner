import { z } from 'zod';

// Physical values are decimal millimeters, never drawing pixels or grid cells.
export const mmSchema = z.number().finite().brand<'Mm'>();
export const mm2Schema = z.number().finite().nonnegative().brand<'Mm2'>();
export const positiveMmSchema = z.number().finite().positive().brand<'Mm'>();
export const elevationMmSchema = z.number().finite().nonnegative().brand<'Mm'>();
export type Mm = z.infer<typeof mmSchema>;
export type Mm2 = z.infer<typeof mm2Schema>;
export const lengthUnitSchema = z.enum(['mm', 'cm', 'm', 'in', 'ft']);
export type LengthUnit = z.infer<typeof lengthUnitSchema>;
export const MM_PER_UNIT: Readonly<Record<LengthUnit, number>> = Object.freeze({
  mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8,
});
export const GEOMETRIC_TOLERANCE_MM = 0.01;

export function toMm(value: number, unit: LengthUnit): Mm {
  return mmSchema.parse(z.number().finite().parse(value) * MM_PER_UNIT[lengthUnitSchema.parse(unit)]);
}

export function fromMm(value: Mm, unit: LengthUnit): number {
  return mmSchema.parse(value) / MM_PER_UNIT[lengthUnitSchema.parse(unit)];
}

export function toMm2(value: number, squareUnit: LengthUnit): Mm2 {
  const factor = MM_PER_UNIT[lengthUnitSchema.parse(squareUnit)];
  return mm2Schema.parse(z.number().finite().nonnegative().parse(value) * factor * factor);
}

export function fromMm2(value: Mm2, squareUnit: LengthUnit): number {
  const factor = MM_PER_UNIT[lengthUnitSchema.parse(squareUnit)];
  return mm2Schema.parse(value) / (factor * factor);
}

export function sameLength(a: Mm, b: Mm, tolerance = GEOMETRIC_TOLERANCE_MM): boolean {
  return Math.abs(mmSchema.parse(a) - mmSchema.parse(b)) <= z.number().finite().nonnegative().parse(tolerance);
}
