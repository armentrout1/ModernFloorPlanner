import type { PhysicalDocument } from '../domain/document';
import type { DeepReadonly } from '../quantities/immutability';
import type { Calculation, QuantityRecord } from '../quantities/result';
import type { AreaSummaryOutput } from '../quantities/summary';

const OUTPUTS = ['floor-area', 'ceiling-area', 'gross-wall-area'] as const satisfies readonly AreaSummaryOutput[];
const outputSet = new Set<string>(OUTPUTS);
type RecordRow = DeepReadonly<QuantityRecord>;

export type CapturedAreaScope = 'project' | 'level' | 'room';
export type CapturedAreaStatus = 'complete' | 'provisional' | 'partial' | 'unavailable';
export interface CapturedAreaRow {
  scope: CapturedAreaScope;
  scopeId: string;
  scopeLabel: string;
  output: AreaSummaryOutput;
  status: CapturedAreaStatus;
  subtotalStatus: 'complete' | 'provisional' | 'unavailable';
  totalMm2: number | null;
  subtotalMm2: number | null;
  roomIds: readonly string[];
  includedTargetIds: readonly string[];
  excludedTargetIds: readonly string[];
  completeTargetCount: number;
  provisionalTargetCount: number;
  blockedTargetCount: number;
}

export interface CapturedAreaSummary {
  rows: readonly CapturedAreaRow[];
  selectedOutputs: readonly AreaSummaryOutput[];
  selectedRoomIds: readonly string[];
}

function recordRoomId(record: RecordRow) {
  const ids = Array.from(new Set(record.readiness.roomIds));
  return ids.length === 1 ? ids[0] : null;
}

function orderedRoomIds(document: DeepReadonly<PhysicalDocument>, records: readonly RecordRow[]) {
  const selected = new Set(records.flatMap(record => record.readiness.roomIds));
  return document.rooms.map(room => room.id).filter(id => selected.has(id));
}

function summarize(scope: CapturedAreaScope, scopeId: string, scopeLabel: string,
  roomIds: readonly string[], records: readonly RecordRow[]): CapturedAreaRow[] {
  return OUTPUTS.flatMap(output => {
    const selected = records.filter(record => record.output === output);
    if (!selected.length) return [];
    const included = selected.filter(record => record.amounts !== null);
    const excluded = selected.filter(record => record.amounts === null);
    const subtotalMm2 = included.length ? included.reduce((total, record) => total + record.amounts!.net, 0) : null;
    const provisionalTargetCount = included.filter(record => record.status === 'provisional').length;
    const completeTargetCount = included.length - provisionalTargetCount;
    const blockedTargetCount = excluded.length;
    const status: CapturedAreaStatus = !included.length ? 'unavailable' : excluded.length ? 'partial'
      : provisionalTargetCount ? 'provisional' : 'complete';
    const subtotalStatus = subtotalMm2 === null ? 'unavailable' : provisionalTargetCount ? 'provisional' : 'complete';
    return [{
      scope, scopeId, scopeLabel, output, status, subtotalStatus,
      totalMm2: excluded.length ? null : subtotalMm2,
      subtotalMm2,
      roomIds: [...roomIds],
      includedTargetIds: included.map(record => record.targetId),
      excludedTargetIds: excluded.map(record => record.targetId),
      completeTargetCount, provisionalTargetCount, blockedTargetCount,
    }];
  });
}

/** Projects only records already present in an immutable captured calculation.
 * It never evaluates geometry and never treats unselected rooms as selected. */
export function buildCapturedAreaSummary(document: DeepReadonly<PhysicalDocument>,
  calculation: DeepReadonly<Calculation>): CapturedAreaSummary {
  const records = calculation.records.filter(record => outputSet.has(record.output));
  const selectedOutputs = OUTPUTS.filter(output => records.some(record => record.output === output));
  const selectedRoomIds = orderedRoomIds(document, records);
  if (!records.length) return { rows: [], selectedOutputs, selectedRoomIds };

  const project = summarize('project', 'captured-area-project', 'Captured selected area scope',
    selectedRoomIds, records);
  const levels = document.schemaVersion === 2
    ? summarize('level', 'historical-unassigned', 'Historical / unassigned', selectedRoomIds, records)
    : [...document.buildingLevels.levels].sort((a, b) => a.displayOrder - b.displayOrder).flatMap(level => {
      const levelRoomIds = document.rooms.filter(room => document.buildingLevels.roomLevels[room.id] === level.id)
        .map(room => room.id).filter(id => selectedRoomIds.includes(id));
      if (!levelRoomIds.length) return [];
      const levelSet = new Set(levelRoomIds);
      const levelRecords = records.filter(record => {
        const roomId = recordRoomId(record);
        return roomId !== null && levelSet.has(roomId);
      });
      return summarize('level', level.id, level.name, levelRoomIds, levelRecords);
    });
  const rooms = document.rooms.flatMap(room => {
    if (!selectedRoomIds.includes(room.id)) return [];
    const roomRecords = records.filter(record => recordRoomId(record) === room.id);
    return summarize('room', room.id, room.name?.trim() || 'Unnamed room', [room.id], roomRecords);
  });
  return { rows: [...project, ...levels, ...rooms], selectedOutputs, selectedRoomIds };
}
