import type { PhysicalDocument } from '@shared/domain/document';
import type { DrawingSourceScope } from './takeoffReadModel';
export function levelForRoom(document: PhysicalDocument, roomId: string): string | null {
  return document.schemaVersion !== 2 ? document.buildingLevels.roomLevels[roomId] ?? null : null;
}
export function levelNameForRoom(document: PhysicalDocument, roomId: string): string {
  return document.schemaVersion !== 2 ? document.buildingLevels.levels.find(level => level.id === levelForRoom(document, roomId))?.name ?? 'Unknown level' : '';
}
export function sourceRoomIds(document: PhysicalDocument, scope: DrawingSourceScope): string[] {
  const openings = new Set([...scope.openingIds, ...scope.openingFaces.map(face => face.openingId)]);
  const walls = new Set([...scope.wallFaceIds, ...scope.openingFaces.map(face => face.wallFaceId),
    ...document.openings.filter(opening => openings.has(opening.id)).flatMap(opening => opening.attachments.map(face => face.wallFaceId))]);
  const extra=new Set((scope.surfaceOpenings??[]).map(item=>item.roomId));
  if(((document.schemaVersion === 4 || document.schemaVersion === 5)))for(const stair of document.stairsContract.stairs)if(scope.stairIds?.includes(stair.id))for(const endpoint of Object.values(stair.endpoints))if(endpoint.state==='modeled')extra.add(endpoint.roomId);
  return document.rooms.filter(room => scope.roomIds.includes(room.id) || extra.has(room.id) || room.wallFaces.some(wall => walls.has(wall.id))).map(room => room.id);
}
export interface LevelCamera { scale: number; center: { x: number; y: number } }
