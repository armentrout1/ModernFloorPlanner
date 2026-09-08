import type { PhysicalDocument } from '@shared/domain/document';
import type { Room } from '@/utils/types';
import { openingWallCenter } from './openingGeometry';
import { getDoorGeometry } from '@/utils/doorGeometry';
import type { DrawingSourceScope } from './takeoffReadModel';
export interface SourceMark { kind: 'room' | 'wall' | 'opening'; id: string; roomId: string; wallFaceId?: string; x: number; y: number; width: number; height: number }
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
  return marks;
}
export function drawingSourceBounds(marks: SourceMark[]): { x: number; y: number; width: number; height: number } | null {
  if (!marks.length) return null;
  const left = Math.min(...marks.map(mark => mark.x)), top = Math.min(...marks.map(mark => mark.y));
  const right = Math.max(...marks.map(mark => mark.x + mark.width)), bottom = Math.max(...marks.map(mark => mark.y + mark.height));
  return [left, top, right, bottom].every(Number.isFinite) ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}
