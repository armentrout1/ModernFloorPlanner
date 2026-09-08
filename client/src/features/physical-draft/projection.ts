import type { PhysicalDocument } from '@shared/domain/document';
import type { Room, RoomObject } from '@/utils/types';
import { legacyRoomsSchema } from '@shared/legacyValidation';

// This is a disposable view of millimeters using the existing renderer's scale.
// Never write these pixels back to the document or to the legacy save endpoint.
const pixels = (mm: number) => mm * 20 / 304.8;
export interface FloorLevelOpeningView { id: string; wallSide: RoomObject['wallSide']; position: number; size: number }
export function projectPhysicalRooms(document: PhysicalDocument): { rooms: Room[]; notices: string[]; floorLevelOpenings: Record<string, FloorLevelOpeningView[]> } {
  const rooms: Room[] = [], notices: string[] = [];
  const floorLevelOpenings: Record<string, FloorLevelOpeningView[]> = Object.create(null);
  const legacy = legacyRoomsSchema.safeParse(document.compatibility?.original.rooms);
  const originalObjects = legacy.success ? legacy.data.flatMap(room => room.objects ?? []) : [];
  let nextX = 0;
  for (const physical of document.rooms) {
    if (physical.length.state !== 'known' || physical.width.state !== 'known') {
      notices.push(`${physical.name || 'Room'}: finish its plan dimensions to show its drawing.`);
      continue;
    }
    const width = pixels(physical.length.valueMm), height = pixels(physical.width.valueMm);
    const x = physical.presentation ? pixels(physical.presentation.xMm) : nextX;
    const y = physical.presentation ? pixels(physical.presentation.yMm) : 0;
    if ([width, height, Math.abs(x), Math.abs(y)].some(value => !Number.isFinite(value) || value > 1e7) || width <= 0 || height <= 0) {
      notices.push(`${physical.name || 'Room'} is outside the supported drawing range; its measurements are preserved.`);
      continue;
    }
    nextX = Math.max(nextX, x + width + 60);
    const objects: RoomObject[] = [];
    for (const opening of document.openings) {
      const attachment = opening.attachments.find(item => physical.wallFaces.some(wall => wall.id === item.wallFaceId));
      if (!attachment) continue;
      const wall = physical.wallFaces.find(item => item.id === attachment.wallFaceId)!;
      const wallMm = ['top', 'bottom'].includes(wall.side) ? physical.length.valueMm : physical.width.valueMm;
      const clockwise = attachment.offsetMm / wallMm;
      const position = (['bottom', 'left'].includes(wall.side) ? 1 - clockwise : clockwise) * 100;
      if (opening.kind === 'floor-level-opening') {
        if (opening.width.state === 'known') {
          (floorLevelOpenings[physical.id] ??= []).push({ id: opening.id, wallSide: wall.side, position, size: pixels(opening.width.valueMm) });
        } else notices.push(`Opening ${opening.id}: width is unresolved; its marker is not a measured wall gap.`);
        continue;
      }
      // Conflicting widths remain unresolved. Retain the source symbol as a view
      // only, rather than picking a candidate measurement for the engine.
      const original = originalObjects.find(item => item.id === opening.id);
      if (opening.width.state !== 'known') {
        notices.push(`Opening ${opening.id}: width needs review; any shown symbol is the original sketch appearance.`);
        if (original) objects.push({ ...structuredClone(original), wallSide: wall.side, position });
        continue;
      }
      if (opening.kind === 'door' && !opening.appearance) {
        notices.push(`Opening ${opening.id}: door appearance is unrecorded; only an available original sketch symbol is shown.`);
        if (original) objects.push({ ...structuredClone(original), wallSide: wall.side, position });
        continue;
      }
      const object: RoomObject = { id: opening.id, type: opening.kind, wallSide: wall.side, position, size: pixels(opening.width.valueMm) };
      if (opening.kind === 'door' && opening.appearance) {
        object.doorProperties = { style: opening.appearance.style, swingDirection: opening.appearance.swingDirection,
          swingSide: opening.appearance.swingSide, width: opening.width.valueMm / 25.4,
          // Height does not affect the plan-view renderer. Zero never enters the
          // physical document and is not presented as an actual height.
          height: opening.height.state === 'known' ? opening.height.valueMm / 25.4 : 0 };
      }
      if (opening.kind === 'window' && opening.height.state === 'known') object.windowProperties = { height: opening.height.valueMm / 25.4 };
      objects.push(object);
    }
    const group = document.editorContract?.groups.find(item => item.roomIds.includes(physical.id));
    rooms.push({ id: physical.id, name: physical.name, x, y, width, height,
      color: physical.presentation?.color, ...(group ? { groupId: group.id } : {}), objects });
  }
  return { rooms, notices: Array.from(new Set(notices)), floorLevelOpenings };
}
