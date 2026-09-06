import { physicalDocumentSchema, type PhysicalDocument, type PhysicalRoom, type PhysicalOpening } from './document';
import type { Dimension } from './measurements';
import { GEOMETRIC_TOLERANCE_MM as T } from './units';

export const QUANTITY_OUTPUTS = Object.freeze(['floor-area', 'ceiling-area', 'gross-wall-area', 'net-wall-area',
  'baseboard', 'base-shoe', 'crown', 'opening-inventory', 'door-casing', 'window-casing'] as const);
export type QuantityOutput = typeof QUANTITY_OUTPUTS[number];
export type MeasurementRef = { entity: 'room'; id: string; field: 'length' | 'width' | 'ceilingHeight' }
  | { entity: 'opening'; id: string; field: 'width' | 'height' | 'sillHeight' };
export type FieldPath = (string | number)[];
export type CheckStatus = 'valid' | 'invalid' | 'undetermined';
export interface Location {
  roomIds: string[]; wallFaceIds: string[]; openingIds: string[];
  paths: FieldPath[]; scopes: QuantityOutput[];
}
export interface GeometryCheck extends Location {
  code: 'HORIZONTAL_FIT' | 'VERTICAL_FIT' | 'FLOOR_LEVEL_SILL' | 'OPENING_OVERLAP' | 'SHARED_ATTACHMENT_ROOMS' | 'FLOOR_RUN_OVERLAP' | 'CROWN_GAP_FULL_HEIGHT';
  status: CheckStatus; message: string; dependencies: MeasurementRef[];
}
export interface Finding extends Location {
  code: string;
  category: 'invalid-geometry' | 'missing-or-unresolved' | 'unconfirmed-measurement' | 'compatibility-info';
  message: string;
}
export interface GeometryReport {
  reportVersion: 'geometry-v1'; structuralValid: boolean;
  checks: GeometryCheck[]; findings: Finding[];
}
export const FACE_OUTPUTS: readonly QuantityOutput[] = Object.freeze(['net-wall-area', 'baseboard', 'base-shoe', 'crown', 'door-casing', 'window-casing']);
const unique = (values: string[]) => Array.from(new Set(values));

// Roundoff allowance only for subtraction at a floating-point boundary. Neither
// this nor the 0.01mm tolerance is a construction clearance or measurement accuracy.
export const exceedsTolerance = (a: number, b: number) =>
  a - b > T + Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 4;
export const atFloor = (sill: number) => !exceedsTolerance(sill, 0);

export function roomRef(room: PhysicalRoom, field: 'length' | 'width' | 'ceilingHeight'): MeasurementRef {
  return { entity: 'room', id: room.id, field };
}
export function openingRef(opening: PhysicalOpening, field: 'width' | 'height' | 'sillHeight'): MeasurementRef {
  return { entity: 'opening', id: opening.id, field };
}
export function measurementAt(doc: PhysicalDocument, ref: MeasurementRef): Dimension {
  return ref.entity === 'room' ? doc.rooms.find(room => room.id === ref.id)![ref.field]
    : doc.openings.find(opening => opening.id === ref.id)![ref.field];
}
export function measurementPath(doc: PhysicalDocument, ref: MeasurementRef): FieldPath {
  return ref.entity === 'room' ? ['rooms', doc.rooms.findIndex(room => room.id === ref.id), ref.field]
    : ['openings', doc.openings.findIndex(opening => opening.id === ref.id), ref.field];
}
export function wallIndex(doc: PhysicalDocument) {
  return new Map(doc.rooms.flatMap(room => room.wallFaces.map(wall => [wall.id, {
    room, wall, axis: wall.side === 'top' || wall.side === 'bottom' ? 'length' as const : 'width' as const,
  }] as const)));
}
export function measurementFinding(doc: PhysicalDocument, ref: MeasurementRef, location: Location): Finding | undefined {
  const measurement = measurementAt(doc, ref);
  const common = { ...location, paths: [measurementPath(doc, ref)],
    ...(ref.entity === 'opening' ? { openingIds: [ref.id] } : { roomIds: [ref.id], openingIds: [] }) };
  if (measurement.state !== 'known') return { ...common,
    code: measurement.state === 'unknown' ? 'MEASUREMENT_UNKNOWN' : 'MEASUREMENT_UNRESOLVED',
    category: 'missing-or-unresolved', message: measurement.reason };
  if (measurement.provenance.confirmation.status !== 'confirmed') return { ...common,
    code: 'MEASUREMENT_UNCONFIRMED', category: 'unconfirmed-measurement', message: 'Available measurement has not been explicitly confirmed' };
}
export function checkFinding(check: GeometryCheck): Finding | undefined {
  if (check.status === 'valid') return;
  return { code: check.code, category: check.status === 'invalid' ? 'invalid-geometry' : 'missing-or-unresolved',
    message: check.message, roomIds: [...check.roomIds], wallFaceIds: [...check.wallFaceIds],
    openingIds: [...check.openingIds], paths: check.paths.map(path => [...path]), scopes: [...check.scopes] };
}

/** Pure structural diagnostics plus semantic checks. The legacy adapter is not changed.
 * Callers get explicit diagnostics for malformed v2, not a rewritten document.
 */
export function validateGeometry(input: unknown): GeometryReport {
  const report: GeometryReport = { reportVersion: 'geometry-v1', structuralValid: false, checks: [], findings: [] };
  const parsed = physicalDocumentSchema.safeParse(input);
  if (!parsed.success) {
    const raw = input as Partial<PhysicalDocument> | null;
    for (const issue of parsed.error.issues) {
      const entity = issue.path[0], index = issue.path[1];
      const room = entity === 'rooms' && typeof index === 'number' && Array.isArray(raw?.rooms) ? raw.rooms[index] : undefined;
      const opening = entity === 'openings' && typeof index === 'number' && Array.isArray(raw?.openings) ? raw.openings[index] : undefined;
      report.findings.push({ code: 'STRUCTURAL_INVALID', category: 'invalid-geometry', message: issue.message,
        paths: [issue.path], roomIds: typeof room?.id === 'string' ? [room.id] : [],
        openingIds: typeof opening?.id === 'string' ? [opening.id] : [],
        wallFaceIds: Array.isArray(opening?.attachments) ? opening.attachments.filter(a => typeof a?.wallFaceId === 'string').map(a => a.wallFaceId)
          : Array.isArray(room?.wallFaces) && issue.path[2] === 'wallFaces' && typeof issue.path[3] === 'number'
            && typeof room.wallFaces[issue.path[3]]?.id === 'string' ? [room.wallFaces[issue.path[3]].id] : [],
        scopes: [...QUANTITY_OUTPUTS] });
    }
    return report;
  }
  // Validation only: never use Zod's normalized copies to replace preserved JSON.
  const doc = input as PhysicalDocument;
  report.structuralValid = true;
  const walls = wallIndex(doc);
  const value = (ref: MeasurementRef) => {
    const measurement = measurementAt(doc, ref);
    return measurement.state === 'known' ? measurement.valueMm : null;
  };
  const add = (check: GeometryCheck) => {
    report.checks.push(check);
    const finding = checkFinding(check);
    if (finding) report.findings.push(finding);
  };
  doc.rooms.forEach(room => {
    for (const field of ['length', 'width', 'ceilingHeight'] as const) {
      const scopes: QuantityOutput[] = field === 'ceilingHeight'
        ? ['gross-wall-area', ...FACE_OUTPUTS] : QUANTITY_OUTPUTS.filter(output => output !== 'opening-inventory');
      const finding = measurementFinding(doc, roomRef(room, field), {
        roomIds: [room.id], wallFaceIds: room.wallFaces.filter(wall => field === 'ceilingHeight'
          || (['top', 'bottom'].includes(wall.side) ? 'length' : 'width') === field).map(wall => wall.id),
        openingIds: [], paths: [], scopes,
      });
      if (finding) report.findings.push(finding);
    }
  });
  doc.openings.forEach((opening, o) => {
    const roomIds = unique(opening.attachments.map(a => walls.get(a.wallFaceId)!.room.id));
    const wallFaceIds = opening.attachments.map(a => a.wallFaceId);
    const location: Location = { roomIds, wallFaceIds, openingIds: [opening.id], paths: [['openings', o]], scopes: [...FACE_OUTPUTS] };
    for (const field of ['width', 'height', 'sillHeight'] as const) {
      const finding = measurementFinding(doc, openingRef(opening, field), location);
      if (finding) report.findings.push(finding);
    }
    add({ ...location, code: 'SHARED_ATTACHMENT_ROOMS',
      status: roomIds.length === opening.attachments.length ? 'valid' : 'invalid',
      message: 'Two-face shared openings must attach to different rooms; presentation adjacency is not required',
      paths: [['openings', o, 'attachments']], scopes: [...FACE_OUTPUTS, 'opening-inventory'], dependencies: [] });
    if (opening.kind === 'floor-level-opening') {
      const sill = value(openingRef(opening, 'sillHeight'));
      add({ ...location, code: 'FLOOR_LEVEL_SILL', dependencies: [openingRef(opening, 'sillHeight')],
        paths: [['openings', o, 'sillHeight']], status: sill === null ? 'undetermined' : atFloor(sill) ? 'valid' : 'invalid',
        message: 'Explicit floor-level openings require a known zero sill within numerical tolerance' });
    }
    opening.attachments.forEach((attachment, a) => {
      const { room, axis } = walls.get(attachment.wallFaceId)!;
      const loc: Location = { roomIds: [room.id], wallFaceIds: [attachment.wallFaceId], openingIds: [opening.id],
        paths: [['openings', o, 'attachments', a, 'offsetMm']], scopes: [...FACE_OUTPUTS] };
      const widthRef = openingRef(opening, 'width'), wallRef = roomRef(room, axis);
      const width = value(widthRef), wallLength = value(wallRef);
      const start = width === null ? null : attachment.offsetMm - width / 2;
      const end = width === null ? null : attachment.offsetMm + width / 2;
      add({ ...loc, code: 'HORIZONTAL_FIT', dependencies: [widthRef, wallRef],
        status: start === null || end === null || wallLength === null ? 'undetermined'
          : !Number.isFinite(start) || !Number.isFinite(end) || exceedsTolerance(width! / 2, attachment.offsetMm) || exceedsTolerance(end, wallLength) ? 'invalid' : 'valid',
        paths: [...loc.paths, measurementPath(doc, widthRef), measurementPath(doc, wallRef)],
        message: 'Opening center ± width/2 must fit the attached wall length; unknown width/length leaves fit undetermined' });
      const heightRef = openingRef(opening, 'height'), sillRef = openingRef(opening, 'sillHeight'), ceilingRef = roomRef(room, 'ceilingHeight');
      const height = value(heightRef), sill = value(sillRef), ceiling = value(ceilingRef);
      const top = height === null || sill === null ? null : sill + height;
      add({ ...loc, code: 'VERTICAL_FIT', dependencies: [heightRef, sillRef, ceilingRef],
        status: top === null || ceiling === null ? 'undetermined'
          : !Number.isFinite(top) || exceedsTolerance(top, ceiling) ? 'invalid' : 'valid',
        paths: [heightRef, sillRef, ceilingRef].map(ref => measurementPath(doc, ref)),
        message: 'Known nonnegative sill plus opening height must fit this room ceiling' });
    });
  });
  for (const [wallFaceId, { room }] of Array.from(walls)) {
    const attached = doc.openings.filter(opening => opening.attachments.some(a => a.wallFaceId === wallFaceId));
    for (let i = 0; i < attached.length; i++) for (let j = i + 1; j < attached.length; j++) {
      const a = attached[i], b = attached[j];
      const extents = (opening: PhysicalOpening) => {
        const width = value(openingRef(opening, 'width')), height = value(openingRef(opening, 'height')), sill = value(openingRef(opening, 'sillHeight'));
        const center = opening.attachments.find(attachment => attachment.wallFaceId === wallFaceId)!.offsetMm;
        return { x: width === null ? null : [center - width / 2, center + width / 2],
          y: height === null || sill === null ? null : [sill, sill + height] };
      };
      const ae = extents(a), be = extents(b);
      // Compare the original endpoints so tolerance retains the magnitude needed
      // for floating-point roundoff, rather than subtracting first.
      const intersects = (one: number[] | null, two: number[] | null) =>
        one && two && [...one, ...two].every(Number.isFinite)
          ? exceedsTolerance(Math.min(one[1], two[1]), Math.max(one[0], two[0])) : null;
      const x = intersects(ae.x, be.x), y = intersects(ae.y, be.y);
      const status: CheckStatus = x === null || y === null ? 'undetermined' : x && y ? 'invalid' : 'valid';
      const neededFields = ['width', 'height', 'sillHeight'] as const;
      const dependencies = [a, b].flatMap(opening => neededFields.map(field => openingRef(opening, field)));
      const loc: Location = { roomIds: [room.id], wallFaceIds: [wallFaceId], openingIds: [a.id, b.id],
        paths: dependencies.map(ref => measurementPath(doc, ref)), scopes: [...FACE_OUTPUTS] };
      add({ ...loc, code: 'OPENING_OVERLAP', status, dependencies,
        message: 'Overlap requires intersection greater than tolerance in both horizontal and vertical extents; unknown extents can leave the check undetermined' });
      if (x === true && y === false) {
        report.findings.push({ ...loc, code: 'STACKED_PRESENTATION_LIMITATION', category: 'compatibility-info',
          message: 'Openings are vertically separated; the existing 2D editor does not depict their vertical separation' });
      }
    }
  }
  doc.review.forEach((review, index) => report.findings.push({
    code: 'HISTORICAL_COMPATIBILITY_REVIEW', category: 'compatibility-info', message: review.message,
    roomIds: [review.roomId], wallFaceIds: [], openingIds: review.openingId ? [review.openingId] : [],
    paths: [['review', index]], scopes: [...FACE_OUTPUTS],
  }));
  return report;
}
