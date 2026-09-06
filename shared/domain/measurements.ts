import { z } from 'zod';
import { elevationMmSchema, mmSchema, positiveMmSchema } from './units';

export const inputUnitSchema = z.enum(['mm', 'cm', 'm', 'in', 'ft', 'ft-in', 'model-px']);
export const precisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('decimal'), decimalPlaces: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('fraction'), denominator: z.number().int().positive().safe() }).strict(),
  // A numeric JSON field no longer proves how many digits the user entered.
  z.object({ kind: z.literal('unavailable') }).strict(),
]);
export const provenanceSchema = z.object({
  source: z.enum(['manual', 'imported', 'traced', 'device', 'inferred']),
  input: z.string().nullable(),
  unit: inputUnitSchema,
  components: z.array(z.object({
    text: z.string(), unit: inputUnitSchema, precision: precisionSchema,
  }).strict()).min(1),
  confirmation: z.discriminatedUnion('status', [
    z.object({ status: z.literal('unconfirmed') }).strict(),
    z.object({ status: z.literal('needs-review') }).strict(),
    z.object({ status: z.literal('confirmed'), confirmedAt: z.string().datetime({ offset: true }) }).strict(),
  ]),
}).strict();
export type MeasurementProvenance = z.infer<typeof provenanceSchema>;

function measurementSchema(valueSchema: typeof mmSchema) {
  return z.discriminatedUnion('state', [
    z.object({ state: z.literal('known'), valueMm: valueSchema, provenance: provenanceSchema }).strict(),
    z.object({ state: z.literal('unknown'), valueMm: z.null(), reason: z.string().min(1) }).strict(),
    z.object({
      state: z.literal('needs-review'), valueMm: z.null(), reason: z.string().min(1),
      candidates: z.array(z.object({
        label: z.string().min(1), valueMm: valueSchema, provenance: provenanceSchema,
      }).strict()).min(2),
    }).strict(),
  ]);
}

export const dimensionSchema = measurementSchema(positiveMmSchema);
export const elevationSchema = measurementSchema(elevationMmSchema);
export const coordinateMeasurementSchema = measurementSchema(mmSchema);
export type Dimension = z.infer<typeof dimensionSchema>;
export type Elevation = z.infer<typeof elevationSchema>;
export type KnownMeasurement = Extract<Dimension, { state: 'known' }>;
export const unknownMeasurement = (reason: string): Extract<Dimension, { state: 'unknown' }> => ({
  state: 'unknown', valueMm: null, reason,
});
