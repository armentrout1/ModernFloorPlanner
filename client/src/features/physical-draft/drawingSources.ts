import { placementBounds, stairEndpointBounds } from '@shared/domain/stairGeometry';
import type { PhysicalDocument } from '@shared/domain/document';
import type { Room } from '@/utils/types';
import { openingWallCenter } from './openingGeometry';
import { getDoorGeometry } from '@/utils/doorGeometry';
import type { DrawingSourceScope } from './takeoffReadModel';
export interface SourceMark { kind: 'room' | 'wall' | 'opening' | 'surface-opening' | 'stair'; id: string; roomId: string; wallFaceId?: string; x: number; y: number; width: number; height: number }
/** View-only source locations. Unresolved openings get a point marker rather
 * than a fabricated measured width; source identifiers are never rewritten. */
export function drawingSourceMarks(document: PhysicalDocument, rooms: Room[], scope: DrawingSourceScope): SourceMark[] {
  const marks: SourceMark[] = [];
  for (const room of rooms) {
    const physical = document.rooms.find(value => value.id === room.id);
    if (!physical) continue;
    if (scope.roomIds.includes(room.id)) marks.push({ kind: 'room', id: room.id, roomId: room.id, x: room.x, y: room.y, width: room.width, height: room.height });
    for (const wall of physical.wallFaces) {
      if (scope.wallFaceIds.includes(wall.id)) {
        marks.push({ kind: 'wall', id: wall.id, roomId: room.id, wallFaceId: wall.id,
          x: room.x + (wall.side === 'right' ? room.width : 0), y: room.y + (wall.side === 'bottom' ? room.height : 0),
          width: wall.side === 'top' || wall.side === 'bottom' ? room.width : 0,
          height: wall.side === 'left' || wall.side === 'right' ? room.height : 0 });
      }
      for (const opening of document.openings) {
        const attachment = opening.attachments.find(face => face.wallFaceId === wall.id);
        if (!attachment || (!scope.openingIds.includes(opening.id) && !scope.openingFaces.some(face => face.openingId === opening.id && face.wallFaceId === wall.id))) continue;
        const horizontal = wall.side === 'top' || wall.side === 'bottom';
        const lengthMm = horizontal ? physical.length.valueMm : physical.width.valueMm;
        if (lengthMm === null || !Number.isFinite(lengthMm) || lengthMm <= 0) continue;
        const clockwise = attachment.offsetMm / lengthMm;
        const position = (wall.side === 'bottom' || wall.side === 'left' ? 1 - clockwise : clockwise) * 100;
        const point = openingWallCenter(room, wall.side, position), rendered = room.objects?.find(value => value.id === opening.id);
        const extent = rendered?.type === 'door' ? getDoorGeometry(room, rendered).size : rendered?.size
          ?? (opening.width.state === 'known' ? opening.width.valueMm * 20 / 304.8 : 0);
        marks.push({ kind: 'opening', id: opening.id, roomId: room.id, wallFaceId: wall.id,
          x: room.x + point.x - (horizontal ? extent / 2 : 0), y: room.y + point.y - (horizontal ? 0 : extent / 2),
          width: horizontal ? extent : 0, height: horizontal ? 0 : extent });
      }
    }
  }
  if ((document.schemaVersion === 4 || document.schemaVersion === 5)) {
    const pixels = (value: number) => value * 20 / 304.8;
    for (const source of scope.surfaceOpenings ?? []) {
      const opening = document.stairsContract.surfaceOpenings.find(item => item.id === source.openingId), room = rooms.find(room => room.id === source.roomId);
      const attachment = opening?.attachments.find(a => a.roomId === source.roomId && a.surface === source.surface);
      if (!room || !opening || !attachment) continue;
      const bounds = placementBounds(opening.width, opening.length, attachment.placement);
      if (bounds) marks.push({ kind: 'surface-opening', id: opening.id, roomId: room.id, x: room.x + pixels(bounds.x), y: room.y + pixels(bounds.y), width: pixels(bounds.width), height: pixels(bounds.height) });
      else marks.push({ kind: 'room', id: room.id, roomId: room.id, x: room.x, y: room.y, width: room.width, height: room.height });
    }
    for (const id of scope.stairIds ?? []) { const stair = document.stairsContract.stairs.find(item => item.id === id); if (!stair) continue;
      for (const role of ['lower','upper'] as const) { const endpoint = stair.endpoints[role]; if (endpoint.state !== 'modeled') continue;
        const room = rooms.find(item => item.id === endpoint.roomId), bounds = stairEndpointBounds(stair, role);
        if (room && bounds) marks.push({ kind: 'stair', id, roomId: room.id, x: room.x + pixels(bounds.x), y: room.y + pixels(bounds.y), width: pixels(bounds.width), height: pixels(bounds.height) });
      }
    }
  }
  return marks;
}
export function drawingSourceBounds(marks: SourceMark[]): { x: number; y: number; width: number; height: number } | null {
  if (!marks.length) return null;
  const left = Math.min(...marks.map(mark => mark.x)), top = Math.min(...marks.map(mark => mark.y));
  const right = Math.max(...marks.map(mark => mark.x + mark.width)), bottom = Math.max(...marks.map(mark => mark.y + mark.height));
  return [left, top, right, bottom].every(Number.isFinite) ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}
