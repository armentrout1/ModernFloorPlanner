import type { PhysicalDocument, PhysicalOpening, WallSide } from '@shared/domain/document';
import type { Room } from '@/utils/types';
import { copyJson } from '@shared/quantities/canonicalJson';

export const VIEW_PIXELS_PER_FOOT = 20;
export const MM_PER_VIEW_PIXEL = 304.8 / VIEW_PIXELS_PER_FOOT;
export interface Point { x: number; y: number }
export interface PointerView {
  bounds: { left: number; top: number; clientLeft?: number; clientTop?: number };
  scroll: Point; origin: Point; scale: number;
}
export interface WallTarget { roomId: string; wallFaceId: string; side: WallSide; offsetMm: number; point: Point }
/** CSS/client coordinates -> the renderer's unscaled world. Read every input at
 * the actual event: selection/layout/scroll can change during a gesture. */
export function pointerToWorld(point: Point, view: PointerView): Point | null {
  const x = point.x - view.bounds.left - (view.bounds.clientLeft ?? 0) + view.scroll.x - view.origin.x;
  const y = point.y - view.bounds.top - (view.bounds.clientTop ?? 0) + view.scroll.y - view.origin.y;
  if (!Number.isFinite(view.scale) || view.scale <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const world = { x: x / view.scale, y: y / view.scale };
  return Number.isFinite(world.x) && Number.isFinite(world.y) ? world : null;
}
/** Auto-layout positions are used only to locate the displayed room. Only its
 * stable wall ID and physical clockwise CENTER offset leave this function. */
export function findPhysicalWall(point: Point, document: PhysicalDocument, rooms: Room[], tolerance: number): WallTarget | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(tolerance) || tolerance < 0) return null;
  const candidates: { distance: number; inside: boolean; target: WallTarget }[] = [];
  for (const room of rooms) {
    const physical = document.rooms.find(value => value.id === room.id);
    if (!physical || physical.length.state !== 'known' || physical.width.state !== 'known') continue;
    const x = point.x - room.x, y = point.y - room.y;
    const sides: { side: WallSide; along: number; span: number; distance: number; point: Point }[] = [
      { side: 'top', along: x, span: room.width, distance: Math.abs(y), point: { x: room.x + x, y: room.y } },
      { side: 'right', along: y, span: room.height, distance: Math.abs(x - room.width), point: { x: room.x + room.width, y: room.y + y } },
      { side: 'bottom', along: room.width - x, span: room.width, distance: Math.abs(y - room.height), point: { x: room.x + x, y: room.y + room.height } },
      { side: 'left', along: room.height - y, span: room.height, distance: Math.abs(x), point: { x: room.x, y: room.y + y } },
    ];
    for (const side of sides) {
      if (side.distance > tolerance || side.span <= 0 || side.along < 0 || side.along > side.span) continue;
      const lengthMm = side.side === 'top' || side.side === 'bottom' ? physical.length.valueMm : physical.width.valueMm;
      const offsetMm = side.along / side.span * lengthMm;
      const face = physical.wallFaces.find(value => value.side === side.side);
      if (!face || !Number.isFinite(offsetMm)) continue;
      candidates.push({ distance: side.distance, inside: x >= 0 && x <= room.width && y >= 0 && y <= room.height, target: { roomId: room.id, wallFaceId: face.id, side: side.side, offsetMm, point: side.point } });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || Number(b.inside) - Number(a.inside));
  return candidates[0]?.target ?? null;
}
export function openingWallCenter(room: Room, side: WallSide, position: number): Point {
  if (side === 'top') return { x: room.width * position / 100, y: 4 };
  if (side === 'right') return { x: room.width - 4, y: room.height * position / 100 };
  if (side === 'bottom') return { x: room.width * position / 100, y: room.height - 4 };
  return { x: 4, y: room.height * position / 100 };
}
export function moveOpeningPreview(opening: PhysicalOpening, target: WallTarget): PhysicalOpening {
  if (opening.attachments.length !== 1) throw new Error('This shared opening has two wall faces. Move it only with a command that updates both attachments.');
  const proposed = copyJson(opening) as PhysicalOpening;
  proposed.attachments = [{ wallFaceId: target.wallFaceId, anchor: 'center', offsetMm: target.offsetMm as PhysicalOpening['attachments'][number]['offsetMm'] }];
  return proposed;
}
export interface OpeningGestureStamp { draftId: string; revision: number; pointerId: number }
export function gestureMatchesDraft(stamp: OpeningGestureStamp, current: { id: string; localEditRevision: number }) {
  return stamp.draftId === current.id && stamp.revision === current.localEditRevision;
}
