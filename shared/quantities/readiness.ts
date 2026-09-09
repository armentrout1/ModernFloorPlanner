import type { PhysicalDocument, PhysicalOpening } from '../domain/document';
import type { AppDeclaration, ApplicabilityField } from '../domain/applicability';
import {
  validateGeometry, wallIndex, roomRef, openingRef, measurementAt, measurementPath,
  measurementFinding, checkFinding, atFloor, exceedsTolerance,
  type MeasurementRef, type GeometryCheck, type GeometryReport, type Finding, type Location, type QuantityOutput,
} from '../domain/geometryValidation';
import { validateQuantityRequest, QUANTITY_POLICY_VERSION_V2, QUANTITY_POLICY_VERSION_V3, type QuantityPolicyVersion, type ContractError } from './policy';

export interface ApplicabilityReadiness {
  status: 'supported' | 'provisional' | 'unknown' | 'unsupported';
  dependencies: { roomId: string; field: ApplicabilityField; declaration: AppDeclaration }[];
  findings: Finding[];
}
export interface OutputReadiness extends Location {
  /** Present only in v2 results; omitted from historical v1 content/hashes. */
  applicability?: ApplicabilityReadiness;
  output: QuantityOutput;
  wasteFraction: number | null;
  openingBases: { openingId: string; measureBasis: PhysicalOpening['measureBasis'] }[];
  numericBasis: { status: 'sufficient' | 'insufficient'; dependencies: MeasurementRef[]; findings: Finding[] };
  geometry: { status: 'valid' | 'invalid' | 'undetermined'; checks: GeometryCheck[]; findings: Finding[] };
  confirmation: { status: 'confirmed' | 'provisional' | 'unresolved' | 'not-required'; dependencies: MeasurementRef[]; findings: Finding[] };
}
export type ReadinessResult = {
  ok: true; policyVersion: QuantityPolicyVersion; selectionState: 'empty' | 'selected';
  outputs: OutputReadiness[]; validation: GeometryReport;
} | { ok: false; errors: ContractError[]; validation: GeometryReport };
const uniqueRefs = (refs: MeasurementRef[]) => Array.from(new Map(refs.map(ref => [JSON.stringify(ref), ref])).values());

export function evaluateQuantityReadiness(input: unknown, requested: unknown): ReadinessResult {
  const validation = validateGeometry(input);
  if (!validation.structuralValid) return { ok: false, validation, errors: [{
    code: 'INVALID_DOCUMENT', path: [], message: 'Repair structural v2 errors before evaluating selected quantity dependencies',
  }] };
  const doc = input as PhysicalDocument, contract = validateQuantityRequest(doc, requested);
  if (!contract.ok) return { ok: false, errors: contract.errors, validation };
  const request = contract.request, walls = wallIndex(doc), outputs: OutputReadiness[] = [];
  const known = (ref: MeasurementRef) => {
    const measurement = measurementAt(doc, ref);
    return measurement.state === 'known' ? measurement.valueMm : null;
  };
  function evaluate(output: QuantityOutput, location: Location, numeric: MeasurementRef[], checks: GeometryCheck[],
    basisOpenings: PhysicalOpening[], wasteFraction: number | null) {
    numeric = uniqueRefs(numeric);
    const missing = numeric.flatMap(ref => {
      const finding = measurementFinding(doc, ref, location);
      return finding?.category === 'missing-or-unresolved' ? [finding] : [];
    });
    const basisFindings: Finding[] = basisOpenings.flatMap(opening => opening.measureBasis === request.policy.openingMeasureBasis ? [] : [{
      ...location, openingIds: [opening.id], paths: [['openings', doc.openings.indexOf(opening), 'measureBasis']],
      code: opening.measureBasis === 'unknown' ? 'OPENING_BASIS_UNKNOWN' : 'OPENING_BASIS_MISMATCH',
      category: 'missing-or-unresolved' as const,
      message: 'Opening basis must explicitly match ' + request.policy.openingMeasureBasis + '; nominal/clear/finished/rough are not converted',
    }]);
    const geometricFindings = checks.flatMap(check => {
      const finding = checkFinding(check); return finding ? [finding] : [];
    });
    // Missing numeric geometry remains undetermined even when there is no opening check.
    const geometryStatus = checks.some(check => check.status === 'invalid') ? 'invalid'
      : checks.some(check => check.status === 'undetermined') || missing.length ? 'undetermined' : 'valid';
    const dependencies = uniqueRefs([...numeric, ...checks.flatMap(check => check.dependencies)]);
    const confirmationFindings = dependencies.flatMap(ref => {
      const finding = measurementFinding(doc, ref, location); return finding ? [finding] : [];
    });
    const unresolved = dependencies.some(ref => {
      const measurement = measurementAt(doc, ref);
      return measurement.state !== 'known' || measurement.provenance.confirmation.status === 'needs-review';
    }) || basisFindings.length > 0;
    let applicability: ApplicabilityReadiness | undefined;
    if (request.policy.version === QUANTITY_POLICY_VERSION_V2 || request.policy.version === QUANTITY_POLICY_VERSION_V3) {
      const refs: { roomId: string; field: ApplicabilityField }[] = [];
      const add = (roomId: string, field: ApplicabilityField) => {
        if (!refs.some(ref => ref.roomId === roomId && ref.field === field)) refs.push({ roomId, field });
      };
      for (const roomId of location.roomIds) {
        if (output === 'ceiling-area') add(roomId, 'ceiling');
        if (output === 'gross-wall-area' || output === 'net-wall-area') add(roomId, 'walls');
        if (output === 'crown') add(roomId, 'crownPath');
      }
      // Vertical attachment fit and full-height crown gaps need the supported
      // uniform wall-height model, even when ceiling finish itself is unsupported.
      if (output === 'crown' || output === 'door-casing' || output === 'window-casing') {
        for (const check of checks) for (const ref of check.dependencies) {
          if (ref.entity === 'room' && ref.field === 'ceilingHeight') add(ref.id, 'walls');
        }
      }
      const appDependencies = refs.map(ref => {
        const value = doc.calculationContract!.rooms[ref.roomId][ref.field];
        return { ...ref, declaration: { ...value, confirmation: { ...value.confirmation } } };
      });
      const appFindings: Finding[] = appDependencies.flatMap(ref => {
        const { declaration } = ref;
        if (declaration.value !== 'unknown' && declaration.value !== 'unsupported' && declaration.confirmation.status === 'confirmed') return [];
        const unknown = declaration.value === 'unknown', unsupported = declaration.value === 'unsupported';
        return [{ ...location, roomIds: [ref.roomId],
          code: unsupported ? 'APPLICABILITY_UNSUPPORTED' : unknown ? 'APPLICABILITY_UNKNOWN' : 'APPLICABILITY_UNCONFIRMED',
          category: unknown || unsupported ? 'missing-or-unresolved' as const : 'unconfirmed-measurement' as const,
          paths: [['calculationContract', 'rooms', ref.roomId, ref.field]],
          message: ref.field + ': ' + (declaration.detail ?? 'The proposed finish model has not been explicitly confirmed'),
        }];
      });
      applicability = { dependencies: appDependencies, findings: appFindings,
        status: appDependencies.some(ref => ref.declaration.value === 'unsupported') ? 'unsupported'
          : appDependencies.some(ref => ref.declaration.value === 'unknown') ? 'unknown'
          : appFindings.length ? 'provisional' : 'supported' };
    }
    const appBlocked = applicability?.status === 'unknown' || applicability?.status === 'unsupported';
    outputs.push({ ...location, output, wasteFraction,
      ...(applicability ? { applicability } : {}),
      openingBases: basisOpenings.map(opening => ({ openingId: opening.id, measureBasis: opening.measureBasis })),
      numericBasis: { status: missing.length || basisFindings.length ? 'insufficient' : 'sufficient',
        dependencies: numeric, findings: [...missing, ...basisFindings] },
      geometry: { status: geometryStatus, checks, findings: [...geometricFindings, ...missing] },
      confirmation: { status: unresolved || appBlocked ? 'unresolved' : confirmationFindings.length || applicability?.status === 'provisional' ? 'provisional'
        : dependencies.length ? 'confirmed' : 'not-required', dependencies, findings: [...confirmationFindings, ...basisFindings, ...(applicability?.findings ?? [])] },
    });
  }
  const loc = (output: QuantityOutput, roomIds: string[], wallFaceIds: string[], openingIds: string[]): Location =>
    ({ roomIds, wallFaceIds, openingIds, paths: [], scopes: [output] });
  const faceChecks = (wallFaceId: string, openings: PhysicalOpening[]) => {
    const ids = new Set(openings.map(opening => opening.id));
    return validation.checks.filter(check => check.wallFaceIds.includes(wallFaceId)
      && check.openingIds.some(id => ids.has(id)));
  };
  for (const selection of request.selections) {
    const output = selection.output;
    if ('roomIds' in selection) {
      for (const id of selection.roomIds) {
        const room = doc.rooms.find(room => room.id === id)!;
        evaluate(output, loc(output, [id], [], []), [roomRef(room, 'length'), roomRef(room, 'width')], [], [], selection.wasteFraction);
      }
    } else if ('openingIds' in selection) {
      // An empty selection returns no output, never all openings.
      if (!selection.openingIds.length) continue;
      const openings = doc.openings.filter(opening => selection.openingIds.includes(opening.id));
      const wallIds = Array.from(new Set(openings.flatMap(opening => opening.attachments.map(a => a.wallFaceId))));
      evaluate(output, loc(output, Array.from(new Set(wallIds.map(id => walls.get(id)!.room.id))), wallIds, [...selection.openingIds]), [],
        validation.checks.filter(check => check.code === 'SHARED_ATTACHMENT_ROOMS'
          && check.openingIds.some(id => selection.openingIds.includes(id))), [], null);
    } else {
      const selectedFaces = 'wallFaceIds' in selection ? selection.wallFaceIds.map(wallFaceId => ({ wallFaceId, openingId: null }))
        : selection.faces;
      for (const face of selectedFaces) {
        const { room, axis } = walls.get(face.wallFaceId)!;
        const attached = doc.openings.filter(opening => opening.attachments.some(a => a.wallFaceId === face.wallFaceId));
        const faceOpenings = face.openingId === null ? attached : attached.filter(opening => opening.id === face.openingId);
        const location = loc(output, [room.id], [face.wallFaceId], faceOpenings.map(opening => opening.id));
        let numeric: MeasurementRef[] = [roomRef(room, axis)], relevant: PhysicalOpening[] = [], basis: PhysicalOpening[] = [];
        let checks: GeometryCheck[] = [];
        if (output === 'gross-wall-area') {
          location.openingIds = [];
          numeric.push(roomRef(room, 'ceilingHeight'));
        } else if (output === 'net-wall-area') {
          numeric.push(roomRef(room, 'ceilingHeight'));
          relevant = faceOpenings; basis = faceOpenings;
          numeric.push(...relevant.flatMap(opening => [openingRef(opening, 'width'), openingRef(opening, 'height')]));
          checks = faceChecks(face.wallFaceId, relevant);
        } else if (output === 'baseboard' || output === 'base-shoe') {
          // Classification is a dependency: an unknown sill is never assumed elevated.
          numeric.push(...faceOpenings.map(opening => openingRef(opening, 'sillHeight')));
          relevant = faceOpenings.filter(opening => {
            const sill = known(openingRef(opening, 'sillHeight')); return sill !== null && atFloor(sill);
          });
          basis = relevant;
          numeric.push(...relevant.map(opening => openingRef(opening, 'width')));
          checks = faceChecks(face.wallFaceId, relevant).filter(check => ['HORIZONTAL_FIT', 'FLOOR_LEVEL_SILL', 'SHARED_ATTACHMENT_ROOMS'].includes(check.code));
          // Floor-run validation needs widths/sills, not opening or ceiling heights.
          for (let i = 0; i < relevant.length; i++) for (let j = i + 1; j < relevant.length; j++) {
            const a = relevant[i], b = relevant[j], aw = known(openingRef(a, 'width')), bw = known(openingRef(b, 'width'));
            const ac = a.attachments.find(item => item.wallFaceId === face.wallFaceId)!.offsetMm;
            const bc = b.attachments.find(item => item.wallFaceId === face.wallFaceId)!.offsetMm;
            const end = aw === null || bw === null ? null : Math.min(ac + aw / 2, bc + bw / 2);
            const start = aw === null || bw === null ? null : Math.max(ac - aw / 2, bc - bw / 2);
            const refs = [openingRef(a, 'width'), openingRef(b, 'width'), openingRef(a, 'sillHeight'), openingRef(b, 'sillHeight')];
            checks.push({ ...location, openingIds: [a.id, b.id], code: 'FLOOR_RUN_OVERLAP',
              status: start === null || end === null ? 'undetermined' : !Number.isFinite(start) || !Number.isFinite(end) || exceedsTolerance(end, start) ? 'invalid' : 'valid',
              dependencies: refs, paths: refs.map(ref => measurementPath(doc, ref)),
              message: 'Distinct floor-level openings must not overlap their floor-run intervals; later deductions use union once' });
          }
          // Contradictory floor-level kind is relevant even with a positive sill.
          for (const check of validation.checks.filter(check => check.code === 'FLOOR_LEVEL_SILL'
            && check.wallFaceIds.includes(face.wallFaceId))) if (!checks.includes(check)) checks.push(check);
        } else if (output === 'crown') {
          relevant = faceOpenings.filter(opening => request.policy.crownFullHeightGaps.some(gap =>
            gap.wallFaceId === face.wallFaceId && gap.openingId === opening.id));
          basis = relevant;
          location.openingIds = relevant.map(opening => opening.id);
          if (relevant.length) numeric.push(roomRef(room, 'ceilingHeight'));
          for (const opening of relevant) {
            const refs = [openingRef(opening, 'width'), openingRef(opening, 'height'), openingRef(opening, 'sillHeight')];
            numeric.push(...refs);
            const sill = known(refs[2]), height = known(refs[1]), ceiling = known(roomRef(room, 'ceilingHeight'));
            const top = sill === null || height === null ? null : sill + height;
            checks.push({
              ...location, openingIds: [opening.id], code: 'CROWN_GAP_FULL_HEIGHT',
              status: top === null || ceiling === null ? 'undetermined'
                : !Number.isFinite(top) || !atFloor(sill!) || exceedsTolerance(top, ceiling) || exceedsTolerance(ceiling, top) ? 'invalid' : 'valid',
              dependencies: [...refs, roomRef(room, 'ceilingHeight')], paths: [...refs, roomRef(room, 'ceilingHeight')].map(ref => measurementPath(doc, ref)),
              message: 'Explicit crown gap must start at zero sill and reach this room ceiling within tolerance',
            });
          }
          checks.push(...faceChecks(face.wallFaceId, relevant));
        } else {
          // Casing numeric basis is opening width/height, not the full room perimeter.
          relevant = faceOpenings; basis = faceOpenings;
          numeric = relevant.flatMap(opening => [openingRef(opening, 'width'), openingRef(opening, 'height')]);
          checks = faceChecks(face.wallFaceId, relevant);
        }
        evaluate(output, location, numeric, checks, basis, selection.wasteFraction);
      }
    }
  }
  return { ok: true, policyVersion: request.policy.version,
    selectionState: outputs.length ? 'selected' : 'empty', outputs, validation };
}
