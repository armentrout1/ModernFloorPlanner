import { levelNameForRoom } from './levelView';
import type { PhysicalDocument } from '@shared/domain/document';
import type { Finding, QuantityOutput } from '@shared/domain/geometryValidation';
import { calculateQuantities, type CalculationResult } from '@shared/quantities/engine';
import { formatQuantity } from '@shared/quantities/display';
import type { Amounts, QuantityAggregate, QuantityRecord } from '@shared/quantities/result';
import type { ContractError, QuantityRequest, QuantitySelection } from '@shared/quantities/policy';
import type { DeepReadonly } from '@shared/quantities/immutability';
import { previewDocument, type InputUnit, type PhysicalDraft } from './state';
import { pendingWasteOutputs, getWasteField, wasteError } from './takeoffCommands';

export const OUTPUT_LABELS: Readonly<Record<QuantityOutput, string>> = Object.freeze({
  'floor-area': 'Floor area', 'ceiling-area': 'Flat ceiling area', 'gross-wall-area': 'Gross wall area',
  'net-wall-area': 'Net wall area', baseboard: 'Baseboard', 'base-shoe': 'Base shoe', crown: 'Crown',
  'door-casing': 'Door casing', 'window-casing': 'Window casing', 'opening-inventory': 'Physical opening inventory',
});
export interface DrawingSourceScope {
  roomIds: string[]; wallFaceIds: string[]; openingIds: string[];
  openingFaces: { openingId: string; wallFaceId: string }[];
  surfaceOpenings?: { openingId:string; roomId:string; surface:'floor'|'ceiling' }[];
  stairIds?: string[];
}
export interface DrawingSourceFocus { key: string; scope: DrawingSourceScope }
export const emptySourceScope = (): DrawingSourceScope => ({ roomIds: [], wallFaceIds: [], openingIds: [], openingFaces: [] });
const unique = (values: string[]) => Array.from(new Set(values));
export function roomLabel(document: PhysicalDocument, id: string) {
  const room = document.rooms.find(item => item.id === id);
  const name = room?.name?.trim() || (room ? 'Room ' + (document.rooms.indexOf(room) + 1) : 'Removed room');
  return room && document.schemaVersion !== 2 ? levelNameForRoom(document, id) + ' · ' + name : name;
}
export function wallLabel(document: PhysicalDocument, id: string) {
  const room = document.rooms.find(item => item.wallFaces.some(wall => wall.id === id));
  const wall = room?.wallFaces.find(item => item.id === id);
  return room && wall ? roomLabel(document, room.id) + ' · ' + wall.side + ' wall' : 'Removed wall';
}
export function openingLabel(document: PhysicalDocument, id: string) {
  const opening = document.openings.find(item => item.id === id);
  if (!opening) return 'Removed opening';
  const kind = opening.kind === 'floor-level-opening' ? 'Opening' : opening.kind === 'door' ? 'Door' : 'Window';
  const index = document.openings.filter(item => item.kind === opening.kind).indexOf(opening) + 1;
  const rooms = document.rooms.filter(room => room.wallFaces.some(wall => opening.attachments.some(face => face.wallFaceId === wall.id)));
  return kind + ' ' + index + (rooms.length ? ' in ' + rooms.map(room => roomLabel(document, room.id)).join(' / ') : '');
}
export function faceLabel(document: PhysicalDocument, face: { openingId: string; wallFaceId: string }) {
  return openingLabel(document, face.openingId) + ' · ' + wallLabel(document, face.wallFaceId);
}
export function scopeForSelection(selection: QuantitySelection): DrawingSourceScope {
  const scope = emptySourceScope();
  if ('roomIds' in selection) scope.roomIds = [...selection.roomIds];
  else if ('wallFaceIds' in selection) scope.wallFaceIds = [...selection.wallFaceIds];
  else if ('openingIds' in selection) scope.openingIds = [...selection.openingIds];
  else scope.openingFaces = selection.faces.map(face => ({ ...face }));
  return scope;
}
/** Scope is a view of the stored request, never inferred from the edit selection. */
export function scopeForRequest(_document: PhysicalDocument, request: QuantityRequest): DrawingSourceScope {
  const parts = request.selections.map(scopeForSelection);
  return { roomIds: unique(parts.flatMap(part => part.roomIds)), wallFaceIds: unique(parts.flatMap(part => part.wallFaceIds)),
    openingIds: unique(parts.flatMap(part => part.openingIds)), openingFaces: Array.from(new Map(parts.flatMap(part => part.openingFaces)
      .map(face => [JSON.stringify([face.openingId, face.wallFaceId]), { ...face }])).values()) };
}
export function sourceForRecord(record: DeepReadonly<QuantityRecord>): DrawingSourceScope {
  const scope = emptySourceScope(), ready = record.readiness;
  if (record.output === 'opening-inventory') scope.openingIds = [...ready.openingIds];
  else if (record.output === 'door-casing' || record.output === 'window-casing') {
    scope.openingFaces = ready.wallFaceIds.flatMap(wallFaceId => ready.openingIds.map(openingId => ({ wallFaceId, openingId })));
  } else if (ready.wallFaceIds.length) scope.wallFaceIds = [...ready.wallFaceIds];
  else scope.roomIds = [...ready.roomIds];
  return scope;
}
export function sourceLabel(document: PhysicalDocument, scope: DrawingSourceScope) {
  return [...scope.roomIds.map(id => roomLabel(document, id)), ...scope.wallFaceIds.map(id => wallLabel(document, id)),
    ...scope.openingFaces.map(face => faceLabel(document, face)), ...scope.openingIds.map(id => openingLabel(document, id))].join('; ');
}
export function quantityText(value: number, unit: 'mm' | 'mm2' | 'count', displayUnit: InputUnit): string {
  const formatted = formatQuantity({ value, unit }, { unit: unit === 'count' ? 'count' : displayUnit, fractionDigits: unit === 'count' ? 0 : 2 });
  if (!formatted.ok) return 'Unavailable';
  return formatted.formatted + (unit === 'count' ? ' count' : unit === 'mm2' ? displayUnit === 'ft' ? ' sq ft' : ' m²' : ' ' + displayUnit);
}
const signedQuantity = (value: number, unit: 'mm' | 'mm2', displayUnit: InputUnit) =>
  (value < 0 ? '−' : '') + quantityText(Math.abs(value), unit, displayUnit);
export interface TakeoffAmounts {
  gross: string; rawDeductions: string; effectiveDeductions: string; net: string;
  allowance: string | null; adjusted: string | null; wastePercent: string | null;
}
function displayAmounts(amounts: DeepReadonly<Amounts> | null, unit: QuantityRecord['unit'], displayUnit: InputUnit, pending: boolean): TakeoffAmounts | null {
  if (amounts === null) return null;
  const value = (number: number) => quantityText(number, unit, displayUnit);
  return { gross: value(amounts.gross), rawDeductions: value(amounts.rawDeductions), effectiveDeductions: value(amounts.effectiveDeductions), net: value(amounts.net),
    allowance: pending || unit === 'count' ? null : value(amounts.allowance), adjusted: pending || unit === 'count' ? null : value(amounts.adjusted),
    wastePercent: pending || amounts.wasteFraction === null ? null : String(amounts.wasteFraction * 100) };
}
export interface TakeoffFinding {
  code: string; category: Finding['category']; message: string; detail: string;
  paths: (string | number)[][]; source: DrawingSourceScope;
}
function usefulFinding(draft: PhysicalDraft, finding: DeepReadonly<Finding>): TakeoffFinding {
  const document = draft.document, path = finding.paths[0] ?? [], scope = emptySourceScope();
  scope.roomIds = [...finding.roomIds]; scope.wallFaceIds = [...finding.wallFaceIds]; scope.openingIds = [...finding.openingIds];
  let message = finding.message;
  const room = path[0] === 'rooms' && typeof path[1] === 'number' ? document.rooms[path[1]] : undefined;
  const opening = path[0] === 'openings' && typeof path[1] === 'number' ? document.openings[path[1]] : undefined;
  const field = path[2];
  const labels: Record<string, string> = { length: 'length', width: 'width', ceilingHeight: 'ceiling height', height: 'height', sillHeight: 'sill height' };
  if ((room || opening) && typeof field === 'string' && Object.hasOwn(labels, field)) {
    const name = room ? roomLabel(document, room.id) : openingLabel(document, opening!.id);
    const raw = opening && draft.openingFields && Object.hasOwn(draft.openingFields, opening.id) ? draft.openingFields[opening.id] : undefined;
    const pendingOffset = field === 'width' && raw?.offset.dirty;
    const pending = room ? draft.fields[room.id]?.[field as 'length' | 'width' | 'ceilingHeight']?.dirty
      : pendingOffset || raw?.[field as 'width' | 'height' | 'sillHeight']?.dirty;
    scope.roomIds = room ? [room.id] : []; scope.wallFaceIds = []; scope.openingIds = opening ? [opening.id] : [];
    const target = name + "'s " + (pendingOffset ? 'center position' : labels[field]);
    if (pending) message = 'Finish editing ' + target + '.';
    else if (finding.code === 'MEASUREMENT_UNKNOWN') message = 'Enter ' + target + '.';
    else if (finding.code === 'MEASUREMENT_UNRESOLVED') message = 'Resolve the conflicting values for ' + target + '.';
    else if (finding.code === 'MEASUREMENT_UNCONFIRMED') message = 'Review and confirm ' + target + '.';
  } else if (opening && field === 'measureBasis') {
    message = 'Review ' + openingLabel(document, opening.id) + "'s measurement basis: recorded " + opening.measureBasis
      + ', requested ' + draft.request.policy.openingMeasureBasis + '. Measurement bases are not converted.';
  } else if (path[0] === 'calculationContract' && typeof path[2] === 'string' && typeof path[3] === 'string') {
    const model = path[3] === 'ceiling' ? 'ceiling model' : path[3] === 'walls' ? 'wall model' : 'crown path model';
    const name = roomLabel(document, path[2]) + "'s " + model;
    message = finding.code === 'APPLICABILITY_UNSUPPORTED' ? name + ' is unsupported for this work.'
      : finding.code === 'APPLICABILITY_UNKNOWN' ? 'Declare ' + name + '.' : 'Review and confirm ' + name + '.';
  }
  if (finding.category === 'invalid-geometry') {
    const names = finding.openingIds.map(id => openingLabel(document, id)).join(' and ');
    if (finding.code === 'HORIZONTAL_FIT') message = names + ' extends beyond the selected wall. Check its width and center position.';
    else if (finding.code === 'VERTICAL_FIT') message = names + ' extends beyond the wall height. Check its height, sill and room ceiling height.';
    else if (finding.code === 'OPENING_OVERLAP' || finding.code === 'FLOOR_RUN_OVERLAP') message = names + ' overlap on the selected wall. Review their sizes and positions.';
    else if (finding.code === 'FLOOR_LEVEL_SILL') message = names + ' must have a floor-level sill for this opening type.';
  }
  return { code: finding.code, category: finding.category, message, detail: finding.message,
    paths: finding.paths.map(path => [...path]), source: scope };
}
export interface TakeoffContribution {
  openingId: string; wallFaceId: string; label: string; source: DrawingSourceScope;
  raw: string; effectiveBeforeUnion: string; boundaryAdjustment: string; roundoffAdjustment: string;
}
export interface TakeoffSurfaceContribution { openingId:string; roomId:string; surface:'floor'|'ceiling'; label:string; raw:string; effectiveBeforeUnion:string; source:DrawingSourceScope }
export interface TakeoffRow {
  grossBasis?:string|null; grossBasisStatus?:'complete'|'provisional'|'unavailable'; surfaceContributions:TakeoffSurfaceContribution[];
  targetId: string; label: string; source: DrawingSourceScope; status: QuantityRecord['status'];
  readiness: DeepReadonly<QuantityRecord['readiness']>; amounts: TakeoffAmounts | null;
  contributions: TakeoffContribution[]; adjustments: { code: string; message: string; amount: string }[];
  formula: string; findings: TakeoffFinding[]; record: DeepReadonly<QuantityRecord>;
}
export interface TakeoffOutput {
  grossBasis?:string|null; grossBasisStatus?:'complete'|'provisional'|'unavailable';
  output: QuantityOutput; label: string; targetCount: number; scope: DrawingSourceScope;
  status: QuantityRecord['status'] | 'empty'; completeness: QuantityAggregate['completeness']; subtotalStatus: QuantityAggregate['subtotalStatus'];
  total: TakeoffAmounts | null; subtotal: TakeoffAmounts | null;
  includedTargets: { id: string; label: string }[]; excludedTargets: { id: string; label: string }[];
  rows: TakeoffRow[]; inventory: DeepReadonly<QuantityAggregate['inventory']>; wastePending: boolean; wasteError: string | null;
}
export interface TakeoffReadModel { ok: boolean; result: CalculationResult; outputs: TakeoffOutput[]; scope: DrawingSourceScope; errors: ContractError[] }
export interface TakeoffReadOptions { pendingWaste?: Partial<Record<QuantityOutput, string>> }
/** The only arithmetic comes from the shared engine. Pending-input masking is the
 * same detached full document used by the editor, with selections in the request. */
export function buildTakeoffReadModel(draft: PhysicalDraft, options: TakeoffReadOptions = {}): TakeoffReadModel {
  const pendingWaste: Partial<Record<QuantityOutput, string>> = { ...options.pendingWaste };
  for (const output of pendingWasteOutputs(draft)) {
    pendingWaste[output] = wasteError(getWasteField(draft, output)) ?? 'Finish editing the waste percentage. Adjusted quantities are unavailable.';
  }
  const result = calculateQuantities(previewDocument(draft), draft.request);
  const rows = (result.ok ? result.calculation.records : []).map((record): TakeoffRow => {
    const source = sourceForRecord(record), pending = pendingWaste[record.output] !== undefined;
    const findings = [...record.readiness.numericBasis.findings, ...record.readiness.geometry.findings,
      ...record.readiness.confirmation.findings, ...(record.readiness.applicability?.findings ?? [])];
    const deduped = Array.from(new Map(findings.map(finding => [JSON.stringify([finding.code, finding.paths, finding.openingIds, finding.wallFaceIds]), finding])).values());
    const surfaceFindings:TakeoffFinding[]=(record.readiness.surface?.findings??[]).map(finding=>({code:finding.code,category:finding.code==='SURFACE_OPENING_INVALID'?'invalid-geometry':'missing-or-unresolved',message:finding.message,detail:finding.message,paths:[[...finding.path]],source:{...emptySourceScope(),roomIds:[record.readiness.surface!.roomId],...(finding.path[1]==='stairs'&&finding.id?{stairIds:[finding.id]}:finding.id?{surfaceOpenings:[{openingId:finding.id,roomId:record.readiness.surface!.roomId,surface:record.readiness.surface!.surface}]}:{})}}));
    return { ...(record.grossBasis!==undefined?{grossBasis:record.grossBasis===null?null:quantityText(record.grossBasis,record.unit,draft.displayUnit),grossBasisStatus:record.grossBasisStatus}:{}),
      surfaceContributions:(record.trace.surfaceContributions??[]).map(item=>({openingId:item.openingId,roomId:item.roomId,surface:item.surface,label:roomLabel(draft.document,item.roomId)+' · '+item.surface+' · '+((draft.document.schemaVersion===4?draft.document.stairsContract.surfaceOpenings.find(opening=>opening.id===item.openingId)?.name:undefined)||'Surface opening'),raw:quantityText(item.raw,record.unit,draft.displayUnit),effectiveBeforeUnion:quantityText(item.effectiveBeforeUnion,record.unit,draft.displayUnit),source:{...emptySourceScope(),surfaceOpenings:[{openingId:item.openingId,roomId:item.roomId,surface:item.surface}]}})),
      targetId: record.targetId, label: sourceLabel(draft.document, source), source, status: record.status, readiness: record.readiness,
      amounts: displayAmounts(record.amounts, record.unit, draft.displayUnit, pending), formula: record.trace.formula,
      findings: [...deduped.map(finding => usefulFinding(draft, finding)),...surfaceFindings], record,
      contributions: record.trace.contributions.map(contribution => ({ openingId: contribution.openingId, wallFaceId: contribution.wallFaceId,
        label: faceLabel(draft.document, contribution), source: { ...emptySourceScope(), openingFaces: [{ openingId: contribution.openingId, wallFaceId: contribution.wallFaceId }] },
        raw: quantityText(contribution.raw, record.unit, draft.displayUnit), effectiveBeforeUnion: quantityText(contribution.effectiveBeforeUnion, record.unit, draft.displayUnit),
        boundaryAdjustment: quantityText(contribution.boundaryAdjustment, record.unit, draft.displayUnit),
        roundoffAdjustment: signedQuantity(contribution.roundoffAdjustment, record.unit === 'mm2' ? 'mm2' : 'mm', draft.displayUnit) })),
      adjustments: record.trace.adjustments.map(adjustment => ({ code: adjustment.code, message: adjustment.message,
        amount: quantityText(adjustment.amount, adjustment.unit, draft.displayUnit) })),
    };
  });
  const outputs = draft.request.selections.map((selection): TakeoffOutput => {
    const aggregate = result.ok ? result.calculation.outputs.find(value => value.output === selection.output) : undefined;
    const selectedRows = rows.filter(row => row.record.output === selection.output), scope = scopeForSelection(selection);
    const pending = pendingWaste[selection.output] !== undefined;
    const targets = (ids: readonly string[]) => ids.map(id => ({ id, label: selectedRows.find(row => row.targetId === id)?.label ?? id }));
    const count = 'roomIds' in selection ? selection.roomIds.length : 'wallFaceIds' in selection ? selection.wallFaceIds.length
      : 'openingIds' in selection ? selection.openingIds.length : selection.faces.length;
    return { ...(aggregate?.grossBasis!==undefined?{grossBasis:aggregate.grossBasis===null?null:quantityText(aggregate.grossBasis,aggregate.unit,draft.displayUnit),grossBasisStatus:aggregate.grossBasisStatus}:{}), output: selection.output, label: OUTPUT_LABELS[selection.output], targetCount: count, scope,
      status: aggregate?.status ?? (count ? 'blocked' : 'empty'), completeness: aggregate?.completeness ?? 'none', subtotalStatus: aggregate?.subtotalStatus ?? 'unavailable',
      total: aggregate ? displayAmounts(aggregate.total, aggregate.unit, draft.displayUnit, pending) : null,
      subtotal: aggregate ? displayAmounts(aggregate.subtotal, aggregate.unit, draft.displayUnit, pending) : null,
      includedTargets: targets(aggregate?.includedTargetIds ?? []), excludedTargets: targets(aggregate?.excludedTargetIds ?? []), rows: selectedRows,
      inventory: aggregate?.inventory ?? null, wastePending: pending, wasteError: pendingWaste[selection.output] ?? null };
  });
  return { ok: result.ok, result, outputs, scope: scopeForRequest(draft.document, draft.request), errors: result.ok ? [] : result.errors };
}
