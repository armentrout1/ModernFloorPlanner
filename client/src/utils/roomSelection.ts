import type { Room } from './types';

// Explicit editing groups never imply shared walls or physical opening identity.
export function expandRoomGroups(rooms: Room[], ids: string[]): string[] {
  const selected = new Set(ids);
  const groups = new Set(rooms.filter(room => selected.has(room.id) && room.groupId).map(room => room.groupId));
  return rooms.filter(room => selected.has(room.id) || (room.groupId && groups.has(room.groupId))).map(room => room.id);
}

export function translateRooms(rooms: Room[], ids: string[], dx: number, dy: number): Room[] {
  const selected = new Set(ids);
  return rooms.map(room => selected.has(room.id) ? { ...room, x: room.x + dx, y: room.y + dy } : room);
}

export function roomBounds(rooms: Room[]) {
  if (!rooms.length) return null;
  const x = Math.min(...rooms.map(room => room.x));
  const y = Math.min(...rooms.map(room => room.y));
  return { x, y, width: Math.max(...rooms.map(room => room.x + room.width)) - x,
    height: Math.max(...rooms.map(room => room.y + room.height)) - y };
}
