import type { Room, WallSide } from './types';
import { getDoorGeometry } from './doorGeometry';

export interface PlanPreviewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Clockwise wall direction; (-ty, tx) points into the room in screen coordinates.
const wallDirection: Record<WallSide, readonly [number, number]> = {
  top: [1, 0], right: [0, 1], bottom: [-1, 0], left: [0, -1],
};

/** Bounds of the saved plan and its visible opening geometry, in model pixels.
 * No translation, measurement normalization, or viewport padding is persisted.
 */
export function getPlanPreviewBounds(rooms: readonly Room[]): PlanPreviewBounds | null {
  if (rooms.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const include = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  const includeRect = (x: number, y: number, width: number, height: number) => {
    include(x, y);
    include(x + width, y + height);
  };

  for (const room of rooms) {
    includeRect(room.x, room.y, room.width, room.height);
    for (const object of room.objects ?? []) {
      if (object.type === 'door') {
        const geometry = getDoorGeometry(room, object);
        const { bar, origin, swingSize, doorProperties } = geometry;
        includeRect(room.x + bar.x, room.y + bar.y, bar.width, bar.height);
        if (doorProperties.style === 'sliding') continue;
        const [tx, ty] = wallDirection[object.wallSide];
        const depth = doorProperties.swingDirection === 'inward' ? swingSize : -swingSize;
        // Either hinge uses this quarter-disc bounding box. Rotate its corners
        // with the same clockwise-wall basis as the shared opening renderer.
        for (const u of [0, swingSize]) {
          for (const v of [0, depth]) {
            include(room.x + origin.x + tx * u - ty * v,
              room.y + origin.y + ty * u + tx * v);
          }
        }
      } else if (object.type === 'window') {
        // Window height is metadata; plan-view width is the saved pixel size.
        const horizontal = object.wallSide === 'top' || object.wallSide === 'bottom';
        const center = (horizontal ? room.width : room.height) * object.position / 100;
        const x = horizontal ? center - object.size / 2 : object.wallSide === 'left' ? 0 : room.width - 8;
        const y = horizontal ? object.wallSide === 'top' ? 0 : room.height - 8 : center - object.size / 2;
        includeRect(room.x + x, room.y + y, horizontal ? object.size : 8, horizontal ? 8 : object.size);
      }
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
