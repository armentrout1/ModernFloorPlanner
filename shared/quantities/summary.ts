import type { PhysicalDocument } from '../domain/document';
import type { QuantityOutput } from '../domain/geometryValidation';
import { calculateQuantities, type CalculationResult } from './engine';
import type { DeepReadonly } from './immutability';
import {
  QUANTITY_POLICY_VERSION,
  QUANTITY_POLICY_VERSION_V2,
  QUANTITY_POLICY_VERSION_V3,
  QUANTITY_POLICY_VERSION_V4,
  type ContractError,
  type QuantityRequest,
} from './policy';
import type { Calculation } from './result';

export const AREA_SUMMARY_OUTPUTS = ['floor-area', 'ceiling-area', 'gross-wall-area'] as const satisfies readonly QuantityOutput[];
export type AreaSummaryOutput = typeof AREA_SUMMARY_OUTPUTS[number];
export type AreaSummaryStatus = 'complete' | 'provisional' | 'partial' | 'unavailable';
export type AreaSummaryReason = 'missing-input' | 'unknown-model' | 'unsupported-model' | 'calculation-error' | null;

export interface AreaSummaryValue {
  output: AreaSummaryOutput;
  status: AreaSummaryStatus;
  reason: AreaSummaryReason;
  totalMm2: number | null;
  subtotalMm2: number | null;
  completeRoomCount: number;
  provisionalRoomCount: number;
  incompleteRoomCount: number;
}

export interface AreaSummaryGroup {
  kind: 'room' | 'level' | 'project';
  id: string;
  label: string;
  roomIds: readonly string[];
  values: readonly AreaSummaryValue[];
}

export interface AreaSummary {
  rooms: readonly AreaSummaryGroup[];
  levels: readonly AreaSummaryGroup[];
  project: AreaSummaryGroup;
}

export type AreaSummaryResult =
  | { ok: true; summary: AreaSummary; calculation: DeepReadonly<Calculation> }
  | { ok: false; errors: ContractError[] };

function policyVersion(document: PhysicalDocument): QuantityRequest['policy']['version'] {
  if (document.schemaVersion === 4 || document.schemaVersion === 5) return QUANTITY_POLICY_VERSION_V4;
  if (document.schemaVersion === 3) return QUANTITY_POLICY_VERSION_V3;
  return document.quantityPolicyVersion === QUANTITY_POLICY_VERSION_V2 && document.calculationContract
    ? QUANTITY_POLICY_VERSION_V2 : QUANTITY_POLICY_VERSION;
}

export function createAreaSummaryRequest(document: PhysicalDocument): QuantityRequest {
  const roomIds = document.rooms.map(room => room.id);
  return {
    policy: { version: policyVersion(document), openingMeasureBasis: 'finished', crownFullHeightGaps: [] },
    selections: roomIds.length ? [
      { output: 'floor-area', roomIds, wasteFraction: 0 },
      { output: 'ceiling-area', roomIds, wasteFraction: 0 },
      { output: 'gross-wall-area', wallFaceIds: document.rooms.flatMap(room => room.wallFaces.map(wall => wall.id)), wasteFraction: 0 },
    ] : [],
  };
}

type FrozenCalculation = DeepReadonly<Calculation>;
type FrozenRecord = FrozenCalculation['records'][number];

function blockedReason(records: readonly FrozenRecord[]): AreaSummaryReason {
  const applicability = records.map(record => record.readiness.applicability?.status);
  if (applicability.includes('unsupported')) return 'unsupported-model';
  if (applicability.includes('unknown')) return 'unknown-model';
  return records.some(record => record.errors.some(error => error.code.startsWith('ARITHMETIC_') || error.code === 'CALCULATION_FAILURE'))
    ? 'calculation-error' : 'missing-input';
}

function roomValue(calculation: FrozenCalculation, roomId: string, output: AreaSummaryOutput): AreaSummaryValue {
  const records = calculation.records.filter(record => record.output === output && record.readiness.roomIds.includes(roomId));
  if (!records.length) return { output, status: 'unavailable', reason: 'missing-input', totalMm2: null, subtotalMm2: null,
    completeRoomCount: 0, provisionalRoomCount: 0, incompleteRoomCount: 1 };
  const usable = records.filter(record => record.amounts !== null);
  const subtotal = usable.length ? usable.reduce((total, record) => total + record.amounts!.net, 0) : null;
  if (usable.length !== records.length) return { output, status: usable.length ? 'partial' : 'unavailable',
    reason: blockedReason(records.filter(record => record.amounts === null)), totalMm2: null, subtotalMm2: subtotal,
    completeRoomCount: 0, provisionalRoomCount: 0, incompleteRoomCount: 1 };
  const provisional = usable.some(record => record.status === 'provisional');
  return { output, status: provisional ? 'provisional' : 'complete', reason: null, totalMm2: subtotal, subtotalMm2: subtotal,
    completeRoomCount: provisional ? 0 : 1, provisionalRoomCount: provisional ? 1 : 0, incompleteRoomCount: 0 };
}

function aggregateValue(values: readonly AreaSummaryValue[], output: AreaSummaryOutput): AreaSummaryValue {
  if (!values.length) return { output, status: 'unavailable', reason: 'missing-input', totalMm2: null, subtotalMm2: null,
    completeRoomCount: 0, provisionalRoomCount: 0, incompleteRoomCount: 0 };
  const subtotalValues = values.flatMap(value => value.subtotalMm2 === null ? [] : [value.subtotalMm2]);
  const subtotal = subtotalValues.length ? subtotalValues.reduce((total, value) => total + value, 0) : null;
  const completeRoomCount = values.reduce((total, value) => total + value.completeRoomCount, 0);
  const provisionalRoomCount = values.reduce((total, value) => total + value.provisionalRoomCount, 0);
  const incompleteRoomCount = values.reduce((total, value) => total + value.incompleteRoomCount, 0);
  const incomplete = incompleteRoomCount > 0;
  const status: AreaSummaryStatus = incomplete ? (subtotal === null ? 'unavailable' : 'partial')
    : provisionalRoomCount ? 'provisional' : 'complete';
  const reason = values.find(value => value.reason === 'unsupported-model')?.reason
    ?? values.find(value => value.reason === 'unknown-model')?.reason
    ?? values.find(value => value.reason === 'calculation-error')?.reason
    ?? values.find(value => value.reason)?.reason ?? null;
  return { output, status, reason, totalMm2: incomplete ? null : subtotal, subtotalMm2: subtotal,
    completeRoomCount, provisionalRoomCount, incompleteRoomCount };
}

function group(kind: AreaSummaryGroup['kind'], id: string, label: string, roomIds: readonly string[],
  roomGroups: ReadonlyMap<string, AreaSummaryGroup>): AreaSummaryGroup {
  return { kind, id, label, roomIds: [...roomIds], values: AREA_SUMMARY_OUTPUTS.map(output => aggregateValue(roomIds.flatMap(roomId => {
    const value = roomGroups.get(roomId)?.values.find(item => item.output === output);
    return value ? [value] : [];
  }), output)) };
}

export function summarizeAreaCalculation(document: PhysicalDocument, result: CalculationResult): AreaSummaryResult {
  if (!result.ok) return result;
  const rooms = document.rooms.map((room, index): AreaSummaryGroup => ({
    kind: 'room', id: room.id, label: room.name?.trim() || 'Room ' + (index + 1), roomIds: [room.id],
    values: AREA_SUMMARY_OUTPUTS.map(output => roomValue(result.calculation, room.id, output)),
  }));
  const roomGroups = new Map(rooms.map(room => [room.id, room] as const));
  const levels = document.schemaVersion === 2
    ? [group('level', 'historical-unassigned', 'Historical / unassigned', document.rooms.map(room => room.id), roomGroups)]
    : [...document.buildingLevels.levels].sort((a, b) => a.displayOrder - b.displayOrder).map(level => group(
      'level', level.id, level.name,
      document.rooms.filter(room => document.buildingLevels.roomLevels[room.id] === level.id).map(room => room.id), roomGroups));
  return { ok: true, calculation: result.calculation, summary: {
    rooms, levels, project: group('project', 'project', 'Whole project', document.rooms.map(room => room.id), roomGroups),
  } };
}

export function calculateAreaSummary(document: PhysicalDocument): AreaSummaryResult {
  return summarizeAreaCalculation(document, calculateQuantities(document, createAreaSummaryRequest(document)));
}
