import type { PhysicalDocument, PhysicalRoom, PhysicalOpening, WallSide } from '../domain/document';
import type { Dimension } from '../domain/measurements';
import { validateGeometry, exceedsTolerance } from '../domain/geometryValidation';
import { placementBounds, stairEndpointBounds, validateStairGeometry, type PlanBounds } from '../domain/stairGeometry';
import { layoutBounds, validateLayoutGeometry } from '../domain/layoutGeometry';
import type { DeepReadonly } from '../quantities/immutability';
import type { QuantitySnapshot } from '../quantities/snapshot';

/** Static CSS only: exported alongside the fragment for the existing report shell. */
export const PLAN_DRAWING_CSS = `
.plan-sheet{break-before:page;page-break-before:always;margin:24px 0;color:#172334}
.plan-sheet h2,.plan-sheet h3,.plan-sheet p,.plan-sheet td{overflow-wrap:anywhere}
.plan-sheet svg{display:block;width:100%;height:auto;max-height:130mm;border:1px solid #bcc8d5;background:#fff;break-inside:avoid;page-break-inside:avoid}
.plan-sheet .plan-sheet-caption{font-size:10pt;margin:7px 0}
.plan-sheet .plan-schedule{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt}
.plan-sheet .plan-schedule th,.plan-sheet .plan-schedule td{border:1px solid #c7d1dd;padding:5px;vertical-align:top;white-space:normal;overflow-wrap:anywhere}
.plan-sheet .plan-schedule th:first-child{width:12%}.plan-sheet .plan-schedule th:nth-child(2){width:35%}
.plan-sheet thead{display:table-header-group}.plan-sheet tr{break-inside:avoid;page-break-inside:avoid}
.plan-sheet .plan-warning{border-left:3px solid #9a5817;padding-left:8px}
@media print{.plan-sheet{margin:0}.plan-sheet svg{max-height:130mm}.plan-sheet h2,.plan-sheet h3{break-after:avoid;page-break-after:avoid}}
`;

type Options = { unit: 'ft' | 'm' };
type Row = { ref: string; name: string; details: string };
type Graphic = { kind: string; id: string; ref: string; bounds: PlanBounds; roomId?: string;
  label?: string; dimensions?: string; opening?: { side: WallSide; width: number; appearance: PhysicalOpening['appearance']; primary: boolean };
  rotation?: number; role?: string };
type Sheet = { id?: string; name: string; roomIds: Set<string>; ownership?: string; historical?: boolean };
const W = 760, H = 430, PAD = 30;
const esc = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const num = (value: number) => String(Number(value.toFixed(5)));
const finite = (values: number[]) => values.every(v => Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER);
function safeBounds(bounds: PlanBounds | null): bounds is PlanBounds {
  if (!bounds || !finite(Object.values(bounds)) || bounds.width <= 0 || bounds.height <= 0) return false;
  return [[bounds.x, bounds.width], [bounds.y, bounds.height]].every(([start, size]) => {
    const end = start + size;
    return finite([end]) && end > start && Math.abs((end - start) - size) <= Math.min(0.001, size * 1e-6) + 16 * Number.EPSILON * size;
  });
}
function measure(value: DeepReadonly<Dimension>, options: Options): string {
  if (value.state !== 'known') return `${value.state}: ${value.reason}`;
  const shown = Number(value.valueMm) / (options.unit === 'ft' ? 304.8 : 1000);
  return `${Number(shown.toFixed(4))} ${options.unit} (${value.provenance.confirmation.status})`;
}
function rect(bounds: PlanBounds, attrs: string): string {
  return `<rect x="${num(bounds.x)}" y="${num(bounds.y)}" width="${num(bounds.width)}" height="${num(bounds.height)}" ${attrs}/>`;
}
function schedule(title: string, rows: Row[]): string {
  if (!rows.length) return '';
  return `<h3>${esc(title)}</h3><table class="plan-schedule"><thead><tr><th>Ref.</th><th>Captured item</th><th>Dimensions and drawing status</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.ref)}</td><td>${esc(r.name)}</td><td>${esc(r.details)}</td></tr>`).join('')}</tbody></table>`;
}
function worldRoom(room: PhysicalRoom): PlanBounds | null {
  if (!room.presentation || room.length.state !== 'known' || room.width.state !== 'known') return null;
  const bounds = { x: room.presentation.xMm, y: room.presentation.yMm, width: room.length.valueMm, height: room.width.valueMm };
  return safeBounds(bounds) ? bounds : null;
}
function roomStatus(room: PhysicalRoom, bounds: PlanBounds | null): string {
  if (bounds) return 'Drawn at captured layout position.';
  if (!room.presentation) return 'Not drawn: layout position not captured; no position has been invented.';
  if (room.length.state !== 'known' || room.width.state !== 'known') return 'Not drawn: plan length or width is unresolved.';
  return 'Not drawn: coordinates cannot preserve the measured extent in supported numeric precision.';
}
/** Renderer consumes the frozen capture as-is. Shared geometry helpers only read their
 * arguments; these type views do not parse, upgrade, normalize or mutate old sources. */
export function renderPlanDrawing(snapshot: DeepReadonly<QuantitySnapshot>, options: Options): string {
  if (options.unit !== 'ft' && options.unit !== 'm') throw new Error('Explicit drawing units are required.');
  const document = snapshot.sourceDocument as PhysicalDocument;
  const hasLevels = document.schemaVersion === 3 || document.schemaVersion === 4 || document.schemaVersion === 5;
  const sheets: Sheet[] = hasLevels ? [...document.buildingLevels.levels].sort((a, b) => a.displayOrder - b.displayOrder).map(level => ({
    id: level.id, name: level.name, ownership: level.ownership,
    roomIds: new Set(document.rooms.filter(r => document.buildingLevels.roomLevels[r.id] === level.id).map(r => r.id)),
  })) : [{ name: 'Captured single layout', historical: true, roomIds: new Set(document.rooms.map(r => r.id)) }];
  const roomRefs = new Map(document.rooms.map((r, i) => [r.id, 'R' + (i + 1)]));
  const roomBounds = new Map(document.rooms.map(r => [r.id, worldRoom(r)]));
  const walls = new Map(document.rooms.flatMap(r => r.wallFaces.map(wall => [wall.id, { room: r, side: wall.side }] as const)));
  const geometry = validateGeometry(document);
  const stairs = document.schemaVersion === 4 || document.schemaVersion === 5 ? validateStairGeometry(document) : null;
  const layout = document.schemaVersion === 5 ? validateLayoutGeometry(document) : null;
  const globalRows: Row[] = [];
  if (document.schemaVersion === 4 || document.schemaVersion === 5) document.stairsContract.stairs.forEach((stair, index) => {
    for (const role of ['lower', 'upper'] as const) if (stair.endpoints[role].state === 'unresolved') globalRows.push({
      ref: `S${index + 1}`, name: `${stair.name || 'Straight stair'} / ${role} endpoint`,
      details: 'Not drawn: destination unresolved. ' + stair.endpoints[role].reason,
    });
  });
  const rendered = sheets.map(sheet => {
    const rooms = document.rooms.filter(r => sheet.roomIds.has(r.id)), graphics: Graphic[] = [], roomRows: Row[] = [], objectRows: Row[] = [];
    const warnings = new Set<string>();
    for (const room of rooms) {
      const bounds = roomBounds.get(room.id)!, ref = roomRefs.get(room.id)!;
      if (bounds) graphics.push({ kind: 'room', id: room.id, ref, bounds, label: room.name || 'Unnamed room', dimensions: `${Number((bounds.width / (options.unit === 'ft' ? 304.8 : 1000)).toFixed(2))} × ${Number((bounds.height / (options.unit === 'ft' ? 304.8 : 1000)).toFixed(2))} ${options.unit}` });
      let detail = `Length ${measure(room.length, options)}; width ${measure(room.width, options)}; ceiling height ${measure(room.ceilingHeight, options)}. ${roomStatus(room, bounds)}`;
      const profile = document.calculationContract?.rooms[room.id];
      if (profile) detail += ` Ceiling model: ${profile.ceiling.value} (${profile.ceiling.confirmation.status}).`;
      if (document.schemaVersion === 5) {
        const use = document.layoutContract.roomUses[room.id];
        detail += ` Room use: ${use.value === 'custom' ? use.customLabel || 'Custom label unfinished' : use.value}.`;
      }
      roomRows.push({ ref, name: `${room.name || 'Unnamed room'} [${room.id}]`, details: detail });
    }
    document.openings.forEach((opening, index) => {
      const ref = (opening.kind === 'door' ? 'D' : opening.kind === 'window' ? 'W' : 'O') + (index + 1);
      opening.attachments.forEach((attachment, ai) => {
        const host = walls.get(attachment.wallFaceId);
        if (!host || !sheet.roomIds.has(host.room.id)) return;
        const bounds = roomBounds.get(host.room.id), width = opening.width.state === 'known' ? opening.width.valueMm : null;
        const length = bounds && (host.side === 'top' || host.side === 'bottom' ? bounds.width : bounds.height);
        const fit = width !== null && length && finite([attachment.offsetMm, width]) && !exceedsTolerance(width / 2, attachment.offsetMm)
          && !exceedsTolerance(attachment.offsetMm + width / 2, length);
        let status = !bounds ? 'Not drawn: host room has no drawable captured placement.'
          : width === null ? 'Not drawn: opening width unresolved.' : !fit ? 'Not drawn: opening does not fit its captured wall.' : 'Drawn at captured wall-center offset.';
        if (bounds && width !== null && fit) {
          const center = attachment.offsetMm, side = host.side;
          const x = side === 'top' ? bounds.x + center - width / 2 : side === 'right' ? bounds.x + bounds.width
            : side === 'bottom' ? bounds.x + bounds.width - center - width / 2 : bounds.x;
          const y = side === 'left' ? bounds.y + bounds.height - center - width / 2 : side === 'right' ? bounds.y + center - width / 2
            : side === 'bottom' ? bounds.y + bounds.height : bounds.y;
          // Nonzero extent accommodates outward swing when fitting the page. The gap
          // itself remains on the captured wall line, with no invented wall thickness.
          graphics.push({ kind: opening.kind, id: opening.id, roomId: host.room.id, ref, bounds: { x, y, width, height: width },
            opening: { side, width, appearance: opening.appearance, primary: ai === 0 } });
          if (opening.kind === 'door' && !opening.appearance) status += ' Swing/style not captured; gap only.';
        }
        if (opening.kind === 'door' && opening.appearance) {
          const appearance = opening.appearance;
          const hand = appearance.swingDirection === 'inward' ? (appearance.swingSide === 'left' ? 'right' : 'left') : appearance.swingSide;
          status += ` Style: ${appearance.style}; ${appearance.swingDirection}; ${hand} hand. Stored hinge side: ${appearance.swingSide}.`;
          if (opening.attachments.length > 1) status += ' Shared opening: swing is shown only at its primary wall face; secondary faces show the same opening gap.';
          if (appearance.style === 'double' || appearance.style === 'bifold') status += ' Swing symbol follows the existing editor convention; leaf arrangement is schematic.';
        }
        objectRows.push({ ref, name: `${opening.kind} [${opening.id}] / ${roomRefs.get(host.room.id)} ${host.side} wall`,
          details: `Width ${measure(opening.width, options)}; height ${measure(opening.height, options)}; sill ${measure(opening.sillHeight, options)}. ${status}` });
      });
    });
    function addFootprint(kind: string, id: string, ref: string, name: string, roomId: string, local: PlanBounds | null, details: string, rotation = 0, role?: string, unsupported = false) {
      if (!sheet.roomIds.has(roomId)) return;
      const host = roomBounds.get(roomId);
      let status = unsupported ? 'Not drawn: unsupported captured geometry.' : !host ? 'Not drawn: host room has no drawable captured placement.'
        : !safeBounds(local) ? 'Not drawn: dimensions or room-local placement unresolved or outside supported precision.' : 'Drawn at captured room-local placement; footprint only.';
      if (!unsupported && host && safeBounds(local)) {
        const bounds = { ...local, x: host.x + local.x, y: host.y + local.y };
        if (safeBounds(bounds)) graphics.push({ kind, id, ref, roomId, bounds, rotation, role });
        else status = 'Not drawn: coordinates cannot preserve the footprint extent.';
      }
      objectRows.push({ ref, name: `${name} [${id}] / ${roomRefs.get(roomId)}${role ? ' / ' + role : ''}`, details: details + ' ' + status });
    }
    if (document.schemaVersion === 4 || document.schemaVersion === 5) {
      document.stairsContract.stairs.forEach((stair, i) => {
        for (const role of ['lower', 'upper'] as const) {
          const endpoint = stair.endpoints[role]; if (endpoint.state !== 'modeled') continue;
          addFootprint('stair', stair.id, `S${i + 1}`, stair.name || 'Straight stair', endpoint.roomId, stairEndpointBounds(stair, role),
            `Run ${measure(stair.run, options)}; width ${measure(stair.width, options)}; rise ${measure(stair.totalRise, options)}. ${stair.alignment.detail} Arrow indicates captured run direction; no tread count is inferred.`, endpoint.placement.rotation, role);
          const landing = stair.landings[role];
          if (landing) addFootprint('landing', landing.id, `S${i + 1}L`, 'Endpoint landing', endpoint.roomId, placementBounds(landing.width, landing.depth, landing.placement),
            `Width ${measure(landing.width, options)}; depth ${measure(landing.depth, options)}.`, landing.placement.rotation, role);
        }
      });
      document.stairsContract.surfaceOpenings.forEach((opening, i) => opening.attachments.forEach(attachment => {
        addFootprint('surface-opening', opening.id, `V${i + 1}`, opening.name || 'Surface opening', attachment.roomId,
          placementBounds(opening.width, opening.length, attachment.placement), `Surface: ${attachment.surface}; width ${measure(opening.width, options)}; length ${measure(opening.length, options)}. ${opening.detail} No automatic deduction is inferred from the graphic.`,
          attachment.placement.rotation, attachment.surface, opening.geometry !== 'internal-rectangle');
      }));
      for (const check of stairs!.checks) if (check.status !== 'valid' && check.roomId && sheet.roomIds.has(check.roomId)) warnings.add(`${check.id}: ${check.message}`);
    }
    if (document.schemaVersion === 5) {
      document.layoutContract.zones.forEach((zone, i) => addFootprint('zone', zone.id, `Z${i + 1}`, zone.name || 'Functional zone', zone.roomId, layoutBounds(zone),
        `Width ${measure(zone.width, options)}; length ${measure(zone.length, options)}. Layout only; not additional room finish area.`, zone.placement.rotation));
      document.layoutContract.cabinetBlocks.forEach((cabinet, i) => addFootprint('fixed-object', cabinet.id, `C${i + 1}`, cabinet.name || 'Cabinet block', cabinet.roomId, layoutBounds(cabinet),
        `Length ${measure(cabinet.length, options)}; depth ${measure(cabinet.depth, options)}; height ${measure(cabinet.height, options)}. Layout only; no purchasing or installation quantity.`, cabinet.placement.rotation));
      for (const check of layout!.checks) if (check.status !== 'valid' && sheet.roomIds.has(check.roomId)) warnings.add(`${check.id}: ${check.message}`);
    }
    for (const finding of geometry.findings) if (finding.roomIds.some(id => sheet.roomIds.has(id))) warnings.add(`${[...finding.roomIds, ...finding.openingIds].join(', ')}: ${finding.message}`);
    const drawing = renderSvg(graphics, sheet.name, warnings);
    return `<section class="plan-sheet" ${sheet.id !== undefined ? `data-level-id="${esc(sheet.id)}"` : 'data-layout="historical"'}><h2>Schematic plan — ${esc(sheet.name)}</h2>
<p class="plan-sheet-caption"><strong>Schematic only — not a certified scale drawing.</strong> Entire captured layout is shown, independently of the selected quantity scope. Each sheet fits independently; do not compare printed scale between levels.</p>
<p class="plan-sheet-caption">Snapshot ${esc(snapshot.instance.id)} · captured ${esc(snapshot.instance.createdAt)} · source schema ${document.schemaVersion}. ${sheet.historical ? 'Level ownership was not captured in this historical document; no level is inferred.' : `Level ownership: ${esc(sheet.ownership!)}; finished-floor elevation is not measured.`}</p>
${rooms.length ? drawing : '<p>No rooms captured on this level.</p>'}
<p class="plan-sheet-caption">R room · D door · W window · O floor-level opening · S stair arrow · L landing · V surface opening · Z zone · C cabinet block. Full names and physical dimensions are in the schedules. Schematic symbols do not verify construction, clearances, structure or quantities.</p>
${schedule('Room schedule', roomRows)}${schedule('Opening and layout schedule', objectRows)}
${warnings.size ? `<h3>Captured conditions needing review</h3><ul class="plan-warning">${Array.from(warnings).map(warning => `<li>${esc(warning)}</li>`).join('')}</ul>` : ''}</section>`;
  }).join('');
  return rendered + (globalRows.length ? `<section class="plan-sheet"><h2>Unplaced building connections</h2>${schedule('Unresolved stair destinations', globalRows)}</section>` : '');
}
function renderSvg(graphics: Graphic[], name: string, warnings: Set<string>): string {
  if (!graphics.length) return '<p>No drawable placements in this captured layout. Unplaced items remain listed below.</p>';
  // Include a full radius around openings so outward symbols are not clipped. This
  // changes only page fitting, never physical positions or the source document.
  const fit = graphics.map(g => g.opening ? { x: g.bounds.x - g.opening.width, y: g.bounds.y - g.opening.width,
    width: g.opening.width * 3, height: g.opening.width * 3 } : g.bounds);
  const minX = Math.min(...fit.map(b => b.x)), minY = Math.min(...fit.map(b => b.y));
  const maxX = Math.max(...fit.map(b => b.x + b.width)), maxY = Math.max(...fit.map(b => b.y + b.height));
  const spanX = maxX - minX, spanY = maxY - minY;
  if (!finite([minX, minY, maxX, maxY, spanX, spanY]) || spanX <= 0 || spanY <= 0) return '<p>Not drawn: the captured layout exceeds supported page-fitting precision. Items remain listed below.</p>';
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
  const left = (W - spanX * scale) / 2, top = (H - spanY * scale) / 2;
  const point = (x: number, y: number) => ({ x: left + (x - minX) * scale, y: top + (y - minY) * scale });
  const screen = (b: PlanBounds): PlanBounds => ({ ...point(b.x, b.y), width: b.width * scale, height: b.height * scale });
  const ordered = [...graphics].sort((a, b) => rank(a.kind) - rank(b.kind));
  const body = ordered.map(g => {
    const b = screen(g.bounds), title = `<title>${esc(g.ref + ' ' + g.kind + ' [' + g.id + ']')}</title>`;
    if (b.width < 3 || b.height < 3) warnings.add(`${g.ref}: footprint is too small to read at this sheet fit; use the schedule dimensions.`);
    let content: string;
    if (g.opening) {
      const { side, width, appearance, primary } = g.opening;
      const size = width * scale;
      const origin = point(g.bounds.x + (side === 'bottom' ? width : 0), g.bounds.y + (side === 'left' ? width : 0));
      const [tx, ty] = side === 'top' ? [1, 0] : side === 'right' ? [0, 1] : side === 'bottom' ? [-1, 0] : [0, -1];
      const gap = `<path d="M 0 0 H ${num(size)}" stroke="white" stroke-width="5"/>`;
      let symbol = `<path d="M 0 0 H ${num(size)}" stroke="#9a5318" stroke-width="1.2"/>`;
      if (g.kind === 'window') symbol = `<path d="M 0 -2 H ${num(size)} M 0 2 H ${num(size)}" stroke="#126477" stroke-width="1.2"/>`;
      else if (g.kind === 'door' && appearance && primary && appearance.style !== 'sliding') {
        const right = appearance.swingSide === 'right', inward = appearance.swingDirection === 'inward';
        const hinge = right ? size : 0, tip = right ? 0 : size, depth = inward ? size : -size, sweep = right === inward ? 0 : 1;
        symbol += `<path data-door-outline="true" d="M ${num(hinge)} 0 L ${num(hinge)} ${num(depth)} M ${num(tip)} 0 A ${num(size)} ${num(size)} 0 0 ${sweep} ${num(hinge)} ${num(depth)}" fill="none" stroke="#9a5318" stroke-width="1.1"/>`;
      } else if (g.kind === 'door' && appearance?.style === 'sliding') symbol += `<path d="M 0 3 H ${num(size * .7)} M ${num(size * .3)} -3 H ${num(size)}" stroke="#9a5318" stroke-width="1.2"/>`;
      content = `<g transform="translate(${num(origin.x)} ${num(origin.y)}) matrix(${tx} ${ty} ${-ty} ${tx} 0 0)"${appearance ? ` data-door-hinge="${appearance.swingSide}" data-door-direction="${appearance.swingDirection}" data-door-style="${appearance.style}"` : ''}>${gap}${symbol}</g><text x="${num(origin.x + 5)}" y="${num(origin.y - 5)}" font-family="Arial,sans-serif" font-size="9" fill="#172334" paint-order="stroke" stroke="white" stroke-width="3">${esc(g.ref)}</text>`;
    } else {
      const styles: Record<string, string> = {
        room: 'fill="#f4f8fc" stroke="#1d354d" stroke-width="1.5"',
        zone: 'fill="none" stroke="#625a9b" stroke-width="1.2" stroke-dasharray="6 3"',
        'fixed-object': 'fill="#e5d9c8" stroke="#654923" stroke-width="1.2"',
        stair: 'fill="none" stroke="#435765" stroke-width="1.2"',
        landing: 'fill="none" stroke="#435765" stroke-width="1.2" stroke-dasharray="3 2"',
        'surface-opening': 'fill="none" stroke="#974d31" stroke-width="1.2" stroke-dasharray="4 3"',
      };
      content = rect(b, styles[g.kind]);
      if (g.kind === 'stair') {
        const horizontal = g.rotation === 0 || g.rotation === 180, reverse = g.rotation === 180 || g.rotation === 270;
        const start = horizontal ? [b.x + b.width * .2, b.y + b.height / 2] : [b.x + b.width / 2, b.y + b.height * .2];
        const end = horizontal ? [b.x + b.width * .8, b.y + b.height / 2] : [b.x + b.width / 2, b.y + b.height * .8];
        if (reverse) [start[0], start[1], end[0], end[1]] = [end[0], end[1], start[0], start[1]];
        const arrow = Math.min(5, b.width / 5, b.height / 5), sign = reverse ? -1 : 1;
        const wing1 = horizontal ? [end[0] - arrow * sign, end[1] - arrow] : [end[0] - arrow, end[1] - arrow * sign];
        const wing2 = horizontal ? [end[0] - arrow * sign, end[1] + arrow] : [end[0] + arrow, end[1] - arrow * sign];
        content += `<path d="M ${start.map(num).join(' ')} L ${end.map(num).join(' ')} M ${wing1.map(num).join(' ')} L ${end.map(num).join(' ')} L ${wing2.map(num).join(' ')}" fill="none" stroke="#435765" stroke-width="1.3"/>`;
      }
      if (g.kind === 'surface-opening') content += `<path d="M ${num(b.x)} ${num(b.y)} L ${num(b.x + b.width)} ${num(b.y + b.height)} M ${num(b.x + b.width)} ${num(b.y)} L ${num(b.x)} ${num(b.y + b.height)}" fill="none" stroke="#974d31" stroke-width="1"/>`;
      if (b.width >= 22 && b.height >= 18) content += `<text x="${num(b.x + b.width / 2)}" y="${num(b.y + (g.kind === 'room' ? b.height / 2 : Math.min(14, b.height / 2)))}" text-anchor="middle" fill="#172334" font-family="Arial,sans-serif" font-size="11" paint-order="stroke" stroke="white" stroke-width="3" stroke-linejoin="round">${esc(g.ref)}</text>`;
    }
    if (g.kind === 'room' && b.width >= 105 && b.height >= 60) {
      const maxChars = Math.max(8, Math.floor(b.width / 7) - 2), label = g.label!.length > maxChars ? g.label!.slice(0, maxChars - 1) + '…' : g.label!;
      content += `<text x="${num(b.x + b.width / 2)}" y="${num(b.y + b.height / 2 + 15)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#172334">${esc(label)}</text><text x="${num(b.x + b.width / 2)}" y="${num(b.y + b.height / 2 + 28)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" fill="#172334">${esc(g.dimensions!)}</text>`;
    }
    return `<g data-kind="${g.kind}" data-entity-id="${esc(g.id)}"${g.role ? ` data-role="${esc(g.role)}"` : ''}>${title}${content}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Schematic plan — ${esc(name)}"><title>Schematic plan — ${esc(name)}</title>${body}</svg>`;
}
function rank(kind: string): number { return kind === 'room' ? 0 : kind === 'zone' ? 1 : kind === 'fixed-object' ? 2 : ['stair', 'landing', 'surface-opening'].includes(kind) ? 3 : 4; }
