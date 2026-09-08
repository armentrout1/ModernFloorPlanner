import type { Room, RoomObject } from './types';

export type DeletedItem =
  | { kind: 'rooms'; items: { room: Room; index: number }[] }
  | { kind: 'room'; room: Room; index: number }
  | { kind: 'opening'; roomId: string; object: RoomObject; index: number };

// Commands retain the complete legacy object, including optional/custom properties.
export function deleteSelection(rooms: Room[], roomId: string | null, objectId: string | null) {
  if (objectId) {
    const room = rooms.find(room => room.objects?.some(object => object.id === objectId));
    const index = room?.objects?.findIndex(object => object.id === objectId) ?? -1;
    if (!room || index < 0) return null;
    const deleted: DeletedItem = { kind: 'opening', roomId: room.id, object: room.objects![index], index };
    return { deleted, rooms: rooms.map(item => item.id === room.id
      ? { ...item, objects: item.objects!.filter(object => object.id !== objectId) } : item) };
  }
  const index = rooms.findIndex(room => room.id === roomId);
  if (index < 0) return null;
  const deleted: DeletedItem = { kind: 'room', room: rooms[index], index };
  return { deleted, rooms: rooms.filter(room => room.id !== roomId) };
}

// Restore only what was deleted so subsequent edits to other rooms survive undo.
export function restoreDeletion(rooms: Room[], deleted: DeletedItem): Room[] | null {
  if (deleted.kind === 'rooms') {
    if (deleted.items.some(item => rooms.some(room => room.id === item.room.id))) return null;
    const restored = [...rooms];
    for (const item of deleted.items) restored.splice(item.index, 0, item.room);
    return restored;
  }
  if (deleted.kind === 'room') {
    if (rooms.some(room => room.id === deleted.room.id)) return null;
    const restored = [...rooms];
    restored.splice(deleted.index, 0, deleted.room);
    return restored;
  }
  if (!rooms.some(room => room.id === deleted.roomId) ||
      rooms.some(room => room.objects?.some(object => object.id === deleted.object.id))) return null;
  return rooms.map(room => {
    if (room.id !== deleted.roomId) return room;
    const objects = [...(room.objects ?? [])];
    objects.splice(deleted.index, 0, deleted.object);
    return { ...room, objects };
  });
}
