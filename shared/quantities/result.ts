import { surfaceReadinessSchema } from './surfaceReadiness';
import { z } from 'zod';
import { elevationSchema } from '../domain/measurements';
import { QUANTITY_OUTPUTS } from '../domain/geometryValidation';
import type { OutputReadiness } from './readiness';
import { quantityRequestSchema } from './policy';
import { roomApplicabilitySchema } from '../domain/applicability';
import { levelOwnershipBasisSchema } from '../domain/levels';

export const RESULT_SCHEMA_VERSION = 'quantity-result-v1' as const;
export const ENGINE_VERSION = 'rectangular-engine-v1' as const;
export const RESULT_SCHEMA_VERSION_V2 = 'quantity-result-v2' as const;
export const ENGINE_VERSION_V2 = 'rectangular-engine-v2' as const;
export const RESULT_SCHEMA_VERSION_V3 = 'quantity-result-v3' as const;
export const ENGINE_VERSION_V3 = 'rectangular-engine-v3' as const;
export const RESULT_SCHEMA_VERSION_V4 = 'quantity-result-v4' as const;
export const ENGINE_VERSION_V4 = 'rectangular-engine-v4' as const;
// A supported decimal magnitude, not a promise of exact fixed-point arithmetic.
export const MAX_QUANTITY_MAGNITUDE = Number.MAX_SAFE_INTEGER;
const amount = z.number().finite().nonnegative().max(MAX_QUANTITY_MAGNITUDE);
const id = z.string().min(1);
const output = z.enum(QUANTITY_OUTPUTS);
const path = z.array(z.union([z.string(), z.number().int().nonnegative()]));
export const contractErrorSchema = z.object({ code: id, path, message: z.string(), id: id.optional() }).strict();
export const measurementRefSchema = z.discriminatedUnion('entity', [
  z.object({ entity: z.literal('room'), id, field: z.enum(['length', 'width', 'ceilingHeight']) }).strict(),
  z.object({ entity: z.literal('opening'), id, field: z.enum(['width', 'height', 'sillHeight']) }).strict(),
]);
const locationShape = { roomIds: z.array(id), wallFaceIds: z.array(id), openingIds: z.array(id),
  paths: z.array(path), scopes: z.array(output) };
const finding = z.object({ ...locationShape, code: id,
  category: z.enum(['invalid-geometry', 'missing-or-unresolved', 'unconfirmed-measurement', 'compatibility-info']),
  message: z.string() }).strict();
const geometryCheck = z.object({ ...locationShape,
  code: z.enum(['HORIZONTAL_FIT', 'VERTICAL_FIT', 'FLOOR_LEVEL_SILL', 'OPENING_OVERLAP',
    'SHARED_ATTACHMENT_ROOMS', 'FLOOR_RUN_OVERLAP', 'CROWN_GAP_FULL_HEIGHT']),
  status: z.enum(['valid', 'invalid', 'undetermined']), message: z.string(),
  dependencies: z.array(measurementRefSchema) }).strict();
const applicabilityReadinessSchema = z.object({
  status: z.enum(['supported', 'provisional', 'unknown', 'unsupported']),
  dependencies: z.array(z.discriminatedUnion('field', [
    z.object({ roomId: id, field: z.literal('ceiling'), declaration: roomApplicabilitySchema.shape.ceiling }).strict(),
    z.object({ roomId: id, field: z.literal('walls'), declaration: roomApplicabilitySchema.shape.walls }).strict(),
    z.object({ roomId: id, field: z.literal('crownPath'), declaration: roomApplicabilitySchema.shape.crownPath }).strict(),
  ])), findings: z.array(finding),
}).strict().superRefine((value, context) => {
  const expected = value.dependencies.some(ref => ref.declaration.value === 'unsupported') ? 'unsupported'
    : value.dependencies.some(ref => ref.declaration.value === 'unknown') ? 'unknown'
    : value.dependencies.some(ref => ref.declaration.confirmation.status !== 'confirmed') ? 'provisional' : 'supported';
  if (value.status !== expected) context.addIssue({ code: z.ZodIssueCode.custom,
    path: ['status'], message: 'Applicability status must describe its declarations' });
  const keys = value.dependencies.map(ref => JSON.stringify([ref.roomId, ref.field]));
  if (new Set(keys).size !== keys.length) context.addIssue({ code: z.ZodIssueCode.custom,
    path: ['dependencies'], message: 'Applicability dependencies must be distinct' });
});
export const outputReadinessSchema: z.ZodType<OutputReadiness, z.ZodTypeDef, unknown> = z.object({
  applicability: applicabilityReadinessSchema.optional(), surface: surfaceReadinessSchema.optional(),
  ...locationShape, output, wasteFraction: z.number().finite().nonnegative().nullable(),
  openingBases: z.array(z.object({ openingId: id, measureBasis: z.enum(['unknown', 'nominal', 'clear', 'finished', 'rough']) }).strict()),
  numericBasis: z.object({ status: z.enum(['sufficient', 'insufficient']), dependencies: z.array(measurementRefSchema), findings: z.array(finding) }).strict(),
  geometry: z.object({ status: z.enum(['valid', 'invalid', 'undetermined']), checks: z.array(geometryCheck), findings: z.array(finding) }).strict(),
  confirmation: z.object({ status: z.enum(['confirmed', 'provisional', 'unresolved', 'not-required']),
    dependencies: z.array(measurementRefSchema), findings: z.array(finding) }).strict(),
}).strict();
const coherent = (a: number, b: number) => Math.abs(a - b) <= Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 32;
export const amountsSchema = z.object({
  gross: amount, rawDeductions: amount, effectiveDeductions: amount, net: amount,
  wasteFraction: amount.nullable(), allowance: amount, adjusted: amount,
}).strict().superRefine((value, ctx) => {
  if (value.net > value.gross || value.effectiveDeductions > value.rawDeductions
      || !coherent(value.gross - value.effectiveDeductions, value.net)
      || !coherent(value.net + value.allowance, value.adjusted)
      || !coherent(value.net * (value.wasteFraction ?? 0), value.allowance)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Amounts must reconcile gross, effective deductions, net and one waste allowance' });
  }
});
export type Amounts = z.infer<typeof amountsSchema>;
export const inventorySchema = z.object({
  door: amount.int(), window: amount.int(), 'floor-level-opening': amount.int(),
}).strict();
const coordinate = z.number().finite().min(-MAX_QUANTITY_MAGNITUDE).max(MAX_QUANTITY_MAGNITUDE);
const intervalSchema = z.object({ start: coordinate, end: coordinate }).strict();
const boundsSchema = z.object({ x: intervalSchema, y: intervalSchema.nullable() }).strict();
const traceSchema = z.object({
  formula: z.string(),
  basis: z.array(z.object({ ref: measurementRefSchema, valueMm: z.number().finite().nonnegative() }).strict()),
  contributions: z.array(z.object({
    openingId: id, wallFaceId: id, raw: amount, effectiveBeforeUnion: amount,
    boundaryAdjustment: amount, roundoffAdjustment: coordinate, rawBounds: boundsSchema, effectiveBounds: boundsSchema,
  }).strict()),
  surfaceContributions: z.array(z.object({
    openingId: id, roomId: id, surface: z.enum(['floor', 'ceiling']), raw: amount, effectiveBeforeUnion: amount,
    boundaryAdjustment: amount, roundoffAdjustment: coordinate, rawBounds: boundsSchema, effectiveBounds: boundsSchema,
  }).strict()).optional(),
  boundaryAdjustment: amount, overlapAdjustment: amount, roundoffAdjustment: coordinate,
  adjustments: z.array(z.object({
    code: z.enum(['BOUNDARY_INTERSECTION', 'COVERAGE_UNION', 'FLOATING_POINT_ROUNDOFF']),
    message: z.string(), amount, unit: z.enum(['mm', 'mm2']),
  }).strict()),
}).strict();
export type QuantityTrace = z.infer<typeof traceSchema>;
export const quantityRecordSchema = z.object({
  targetId: id, output, unit: z.enum(['mm', 'mm2', 'count']),
  status: z.enum(['complete', 'provisional', 'blocked']),
  readiness: outputReadinessSchema,
  evidence: z.array(z.object({ ref: measurementRefSchema, measurement: elevationSchema }).strict()),
  grossBasis: amount.nullable().optional(), grossBasisStatus: z.enum(['complete', 'provisional', 'unavailable']).optional(),
  amounts: amountsSchema.nullable(), trace: traceSchema, errors: z.array(contractErrorSchema),
  inventory: inventorySchema.nullable(),
}).strict().superRefine((record, ctx) => {
  if ((record.status === 'blocked') !== (record.amounts === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amounts'], message: 'Blocked records have unavailable amounts; usable records require amounts' });
  }
  if (record.grossBasis !== undefined && ((record.grossBasis === null) !== (record.grossBasisStatus === 'unavailable')
      || (record.amounts && record.grossBasis !== record.amounts.gross))) ctx.addIssue({
    code: z.ZodIssueCode.custom, path: ['grossBasis'], message: 'Gross basis must remain explicit and agree with usable gross amounts' });
  const surface = record.readiness.surface;
  if (surface && ((surface.status === 'blocked' && record.status !== 'blocked')
      || (surface.status === 'provisional' && record.status === 'complete'))) ctx.addIssue({
    code: z.ZodIssueCode.custom, path: ['status'], message: 'Surface-impact readiness cannot be promoted to a usable or confirmed net' });
  const applicability = record.readiness.applicability;
  if (applicability && ((['unknown', 'unsupported'].includes(applicability.status) && record.status !== 'blocked')
      || (applicability.status === 'provisional' && record.status === 'complete'))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Result must retain unsupported, unknown or provisional applicability' });
  }
  if (record.output !== record.readiness.output) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['readiness', 'output'], message: 'Readiness belongs to this output' });
  }
  const expectedUnit = record.output === 'opening-inventory' ? 'count' : record.output.includes('area') ? 'mm2' : 'mm';
  if (record.unit !== expectedUnit) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['unit'], message: 'Unit does not match output' });
  if (record.status !== 'blocked' && (record.readiness.numericBasis.status !== 'sufficient' || record.readiness.geometry.status !== 'valid'
      || record.readiness.confirmation.status === 'unresolved')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Usable records require sufficient, valid, resolved readiness' });
  }
  if (record.status === 'complete' && !['confirmed', 'not-required'].includes(record.readiness.confirmation.status)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Complete records require confirmed or not-required measurements' });
  }
  if (record.status === 'provisional' && record.readiness.confirmation.status !== 'provisional') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Provisional records require provisional confirmation' });
  }
  if (record.amounts) {
    if (record.output === 'opening-inventory') {
      const value = record.amounts;
      if (!record.inventory || value.wasteFraction !== null || value.allowance !== 0 || value.rawDeductions !== 0
          || value.effectiveDeductions !== 0 || ![value.gross, value.net, value.adjusted].every(Number.isSafeInteger)
          || Object.values(record.inventory).reduce((sum, count) => sum + count, 0) !== value.net) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amounts'], message: 'Inventory is integral identity count by kind with no deductions or waste' });
      }
    } else if (record.inventory !== null || record.amounts.wasteFraction === null
        || record.amounts.wasteFraction !== record.readiness.wasteFraction) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amounts'], message: 'Measured quantities require the explicitly selected waste fraction' });
    }
  } else if (record.inventory !== null || !record.errors.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['errors'], message: 'Unavailable records require reasons and no usable inventory' });
  }
});
export type QuantityRecord = z.infer<typeof quantityRecordSchema>;
export const quantityAggregateSchema = z.object({
  output, unit: z.enum(['mm', 'mm2', 'count']), status: z.enum(['complete', 'provisional', 'blocked']),
  completeness: z.enum(['complete', 'partial', 'none']),
  subtotalStatus: z.enum(['complete', 'provisional', 'unavailable']),
  total: amountsSchema.nullable(), subtotal: amountsSchema.nullable(),
  grossBasis: amount.nullable().optional(), grossBasisStatus: z.enum(['complete', 'provisional', 'unavailable']).optional(),
  includedTargetIds: z.array(id), excludedTargetIds: z.array(id),
  inventory: inventorySchema.nullable(), errors: z.array(contractErrorSchema),
}).strict().superRefine((aggregate, ctx) => {
  if ((aggregate.status === 'blocked') !== (aggregate.total === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['total'], message: 'Blocked selected totals are unavailable' });
  }
  if (aggregate.completeness === 'partial' && (!aggregate.includedTargetIds.length || !aggregate.excludedTargetIds.length || !aggregate.subtotal)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['completeness'], message: 'Partial subtotals identify included and excluded targets' });
  }
  if ((aggregate.subtotal === null) !== (aggregate.subtotalStatus === 'unavailable')
      || (aggregate.status !== 'blocked' && aggregate.subtotalStatus !== aggregate.status)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['subtotalStatus'], message: 'Subtotal availability and confirmation status must remain explicit' });
  }
  if (aggregate.completeness === 'none' && aggregate.subtotal !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['subtotal'], message: 'No usable aggregate basis has no subtotal' });
  }
  const expectedUnit = aggregate.output === 'opening-inventory' ? 'count' : aggregate.output.includes('area') ? 'mm2' : 'mm';
  if (aggregate.unit !== expectedUnit) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['unit'], message: 'Unit does not match output' });
  const ids = [...aggregate.includedTargetIds, ...aggregate.excludedTargetIds];
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['includedTargetIds'], message: 'Aggregate target sets must be distinct and disjoint' });
  if (aggregate.completeness === 'complete' && (aggregate.status === 'blocked' || !aggregate.total || !aggregate.subtotal
      || aggregate.excludedTargetIds.length || !aggregate.includedTargetIds.length || JSON.stringify(aggregate.total) !== JSON.stringify(aggregate.subtotal))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['completeness'], message: 'Complete aggregate covers all targets with matching selected total and subtotal' });
  }
  if (aggregate.status !== 'blocked' && aggregate.completeness !== 'complete') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Incomplete selected outputs remain blocked' });
  }
  for (const values of [aggregate.total, aggregate.subtotal]) if (values) {
    if (aggregate.output === 'opening-inventory') {
      if (!aggregate.inventory || values.wasteFraction !== null || values.allowance !== 0 || values.rawDeductions !== 0
          || values.effectiveDeductions !== 0 || ![values.gross, values.net, values.adjusted].every(Number.isSafeInteger)
          || Object.values(aggregate.inventory).reduce((sum, count) => sum + count, 0) !== values.net) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['inventory'], message: 'Inventory aggregates are integral counts with no waste' });
      }
    } else if (values.wasteFraction === null || aggregate.inventory !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['total'], message: 'Measured output aggregate requires explicit waste and no inventory' });
    }
  }
});
export type QuantityAggregate = z.infer<typeof quantityAggregateSchema>;
export const calculationSchema = z.object({
  schemaVersion: z.enum([RESULT_SCHEMA_VERSION, RESULT_SCHEMA_VERSION_V2, RESULT_SCHEMA_VERSION_V3, RESULT_SCHEMA_VERSION_V4]), engineVersion: z.enum([ENGINE_VERSION, ENGINE_VERSION_V2, ENGINE_VERSION_V3, ENGINE_VERSION_V4]),
  policyVersion: z.enum(['rectangular-flat-v1', 'rectangular-flat-v2', 'rectangular-flat-v3', 'rectangular-flat-v4']),
  source: z.object({
    documentId: z.union([id, z.number().int().positive().safe()]).nullable(),
    revisionId: id.nullable(), revisionState: z.enum(['unsaved', 'identified']),
    levelOwnership: levelOwnershipBasisSchema.optional(),
    stairContent: z.object({ version: z.literal('straight-stairs-v1'), stairIds: z.array(id), surfaceOpeningIds: z.array(id) }).strict().optional(),
  }).strict(),
  request: quantityRequestSchema,
  status: z.enum(['complete', 'provisional', 'blocked', 'empty']),
  records: z.array(quantityRecordSchema), outputs: z.array(quantityAggregateSchema),
}).strict().superRefine((calculation, ctx) => {
  const v4 = calculation.policyVersion === 'rectangular-flat-v4', v3 = calculation.policyVersion === 'rectangular-flat-v3';
  const applicability = calculation.policyVersion !== 'rectangular-flat-v1';
  if (calculation.schemaVersion !== (v4 ? RESULT_SCHEMA_VERSION_V4 : v3 ? RESULT_SCHEMA_VERSION_V3 : applicability ? RESULT_SCHEMA_VERSION_V2 : RESULT_SCHEMA_VERSION)
      || calculation.engineVersion !== (v4 ? ENGINE_VERSION_V4 : v3 ? ENGINE_VERSION_V3 : applicability ? ENGINE_VERSION_V2 : ENGINE_VERSION)
      || calculation.request.policy.version !== calculation.policyVersion
      || Boolean(calculation.source.levelOwnership) !== (v3 || v4)
      || Boolean(calculation.source.stairContent) !== v4
      || calculation.records.some(record => Boolean(record.readiness.applicability) !== applicability)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['schemaVersion'], message: 'Result, engine, policy and applicability versions must agree' });
  }
  const stairSource = calculation.source.stairContent;
  if (stairSource) {
    for (const ids of [stairSource.stairIds, stairSource.surfaceOpeningIds]) if (new Set(ids).size !== ids.length
        || ids.some((id, index) => index > 0 && ids[index - 1] >= id))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['source', 'stairContent'], message: 'Stair and surface identities must be distinct and sorted' });
    if (stairSource.stairIds.some(id => stairSource.surfaceOpeningIds.includes(id)))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['source', 'stairContent'], message: 'Stair and surface-opening identities are separate' });
  }
  for (const record of calculation.records) {
    const surface = v4 && (record.output === 'floor-area' || record.output === 'ceiling-area');
    if (Boolean(record.readiness.surface) !== surface || (record.grossBasis !== undefined) !== surface
        || Boolean(record.grossBasisStatus) !== surface || Boolean(record.trace.surfaceContributions) !== surface)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['records'], message: 'Surface readiness, gross basis and deductions require version4 selected floor/ceiling semantics' });
    if (surface) {
      const readiness = record.readiness.surface!, contributions = record.trace.surfaceContributions!;
      if (!stairSource || readiness.surfaceOpeningIds.some(id => !stairSource.surfaceOpeningIds.includes(id))
          || readiness.stairIds.some(id => !stairSource.stairIds.includes(id))
          || contributions.some(item => item.roomId !== readiness.roomId || item.surface !== readiness.surface
            || !readiness.surfaceOpeningIds.includes(item.openingId))
          || new Set(contributions.map(item => item.openingId)).size !== contributions.length)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['records'], message: 'Surface deductions must retain distinct exact source identities and attachments' });
      if (record.amounts && contributions.length !== readiness.surfaceOpeningIds.length)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['records'], message: 'Every explicit attached opening contributes exactly once to a usable surface' });
      if (record.amounts && (!coherent(contributions.reduce((sum, item) => sum + item.raw, 0), record.amounts.rawDeductions)
          || !coherent(record.amounts.rawDeductions - record.trace.boundaryAdjustment - record.trace.overlapAdjustment - record.trace.roundoffAdjustment,
            record.amounts.effectiveDeductions)))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['records'], message: 'Surface trace must reconcile raw, boundary, union and roundoff deductions' });
    }
    if (surface && (record.readiness.surface!.roomId !== record.readiness.roomIds[0]
        || record.readiness.surface!.surface !== (record.output === 'floor-area' ? 'floor' : 'ceiling')))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['records'], message: 'Surface readiness must identify the selected room finish surface' });
  }
  for (const aggregate of calculation.outputs) {
    const surface = v4 && (aggregate.output === 'floor-area' || aggregate.output === 'ceiling-area');
    if ((aggregate.grossBasis !== undefined) !== surface || Boolean(aggregate.grossBasisStatus) !== surface)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outputs'], message: 'Gross surface basis requires version4' });
    if (surface) {
      const rows = calculation.records.filter(record => record.output === aggregate.output);
      const known = rows.every(row => row.grossBasis !== null), gross = rows.reduce((sum, row) => sum + (row.grossBasis ?? 0), 0);
      const status = !known || gross > MAX_QUANTITY_MAGNITUDE ? 'unavailable'
        : rows.some(row => row.grossBasisStatus === 'provisional') ? 'provisional' : 'complete';
      if (aggregate.grossBasisStatus !== status || (status === 'unavailable' ? aggregate.grossBasis !== null
          : aggregate.grossBasis === null || !coherent(aggregate.grossBasis!, gross)))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outputs', 'grossBasis'], message: 'Gross basis covers every selected surface and retains its confirmation status' });
    }
  }
  if (calculation.source.levelOwnership && calculation.records.some(record =>
      record.readiness.roomIds.some(id => !Object.hasOwn(calculation.source.levelOwnership!.roomLevels, id)))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['source', 'levelOwnership'],
      message: 'Every result room must retain its level identity' });
  }
  if ((calculation.source.revisionId === null) !== (calculation.source.revisionState === 'unsaved')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['source'], message: 'Null revisions are explicitly unsaved' });
  }
  const expected = !calculation.records.length ? 'empty' : calculation.outputs.some(item => item.status === 'blocked') ? 'blocked'
    : calculation.outputs.some(item => item.status === 'provisional') ? 'provisional' : 'complete';
  if (calculation.status !== expected || (calculation.status === 'empty' && calculation.outputs.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Calculation status must describe the selected outputs' });
  }
  const recordKeys = calculation.records.map(record => JSON.stringify([record.output, record.targetId]));
  const outputKeys = calculation.outputs.map(aggregate => aggregate.output);
  if (new Set(recordKeys).size !== recordKeys.length || new Set(outputKeys).size !== outputKeys.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['records'], message: 'Output targets and aggregate outputs must be distinct' });
  }
  if (new Set(calculation.records.map(record => record.output)).size !== outputKeys.length
      || calculation.records.some(record => !outputKeys.includes(record.output))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outputs'], message: 'Every selected output requires exactly one compatible aggregate' });
  }
  for (const aggregate of calculation.outputs) {
    const rows = calculation.records.filter(record => record.output === aggregate.output);
    const included = rows.filter(row => row.amounts !== null).map(row => row.targetId).sort();
    const excluded = rows.filter(row => row.amounts === null).map(row => row.targetId).sort();
    if (!rows.length || JSON.stringify(included) !== JSON.stringify([...aggregate.includedTargetIds].sort())
        || JSON.stringify(excluded) !== JSON.stringify([...aggregate.excludedTargetIds].sort())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outputs'], message: 'Aggregate membership must match compatible record availability' });
    }
    if (aggregate.status !== 'blocked' && aggregate.status !== (rows.some(row => row.status === 'provisional') ? 'provisional' : 'complete')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outputs'], message: 'Aggregate must retain provisional record status' });
    }
    const expectedSubtotal = aggregate.subtotal === null ? 'unavailable'
      : rows.some(row => row.amounts !== null && row.status === 'provisional') ? 'provisional' : 'complete';
    if (aggregate.subtotalStatus !== expectedSubtotal) ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['outputs'], message: 'Subtotal retains the confirmation status of included rows' });
    if (aggregate.subtotal) for (const field of ['gross', 'rawDeductions', 'effectiveDeductions', 'net', 'allowance', 'adjusted'] as const) {
      const sum = rows.reduce((sum, row) => sum + (row.amounts?.[field] ?? 0), 0);
      if (!coherent(sum, aggregate.subtotal[field])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outputs'], message: 'Aggregate subtotal must reconcile to included rows' });
      }
    }
  }
});
export type Calculation = z.infer<typeof calculationSchema>;
