/**
 * CRITICAL: DOORS & WINDOWS FUNCTIONALITY
 * 
 * This file contains core doors/windows logic. Before making ANY changes:
 * 1. Read DOORS_AND_WINDOWS.md thoroughly
 * 2. Test all door/window placement scenarios after changes
 * 3. Verify drag-and-drop behavior still works
 * 4. Check property panel updates correctly
 * 
 * Last verified: June 1, 2025
 */

import type { Room, RoomObject } from './types';
import { pixelsToFeet, calculateRoomArea } from './canvas';

interface DoorWidthWarning {
  roomId: string;
  roomName: string;
  doorId: string;
  wallSide: RoomObject['wallSide'];
  enteredWidthInches: number;
  sketchWidthInches: number;
}

interface MaterialCalculations {
  widthWarnings: DoorWidthWarning[];
  baseboardFeet: number;
  baseShoeboardFeet: number;
  doorCount: number;
  windowCount: number;
  doorSizes: { width: number; count: number }[];
  totalWallLengthFeet: number;
  totalArea: number;
}

export const calculateRoomPerimeter = (room: Room): number => {
  // Calculate perimeter in feet (2 * width + 2 * height)
  return 2 * pixelsToFeet(room.width) + 2 * pixelsToFeet(room.height);
};

// Legacy sketches store display size in pixels, but edited door dimensions in
// inches. Prefer the entered width without snapping or rounding it to the grid.
// Conflicts are reported below for review; calculation never rewrites the sketch.
export const calculateDoorWidthFeet = (door: RoomObject): number => {
  const widthInches = door.doorProperties?.width;
  return typeof widthInches === 'number' && Number.isFinite(widthInches) && widthInches > 0
    ? widthInches / 12
    : pixelsToFeet(door.size);
};

export const calculateMaterials = (
  rooms: Room[]
): MaterialCalculations => {
  const widthWarnings: DoorWidthWarning[] = [];
  let baseboardFeet = 0;
  let baseShoeboardFeet = 0;
  let totalWallLengthFeet = 0;
  let doorCount = 0;
  let windowCount = 0;
  let totalArea = 0;
  const doorWidthsMap = new Map<number, number>(); // Map of door width to count

  // Calculate materials for each room
  rooms.forEach(room => {
    // Calculate perimeter for baseboard and base shoe
    const perimeter = calculateRoomPerimeter(room);
    totalWallLengthFeet += perimeter;
    
    // Calculate area for flooring
    totalArea += calculateRoomArea(room);

    let doorDeductionFeet = 0;

    // Count openings independently from the room's one perimeter contribution.
    if (room.objects && room.objects.length > 0) {
      room.objects.forEach((obj: RoomObject) => {
        if (obj.type === 'door') {
          doorCount++;
          
          const doorWidthFeet = calculateDoorWidthFeet(obj);
          const enteredWidth = obj.doorProperties?.width;
          if (typeof enteredWidth === 'number' && Number.isFinite(enteredWidth) && enteredWidth > 0
              && Math.abs(pixelsToFeet(obj.size) - doorWidthFeet) > 1e-9) {
            widthWarnings.push({
              roomId: room.id, roomName: room.name || 'Unnamed room', doorId: obj.id,
              wallSide: obj.wallSide, enteredWidthInches: enteredWidth,
              sketchWidthInches: pixelsToFeet(obj.size) * 12,
            });
          }
          
          // Add to door widths map
          doorWidthsMap.set(
            doorWidthFeet, 
            (doorWidthsMap.get(doorWidthFeet) || 0) + 1
          );
          
          doorDeductionFeet += doorWidthFeet;
        } else if (obj.type === 'window') {
          windowCount++;
          
          // Legacy windows are elevated openings and do not interrupt trim.
        }
      });
    }

    // Both default trim quantities stop at doors and pass beneath windows.
    const trimFeet = perimeter - doorDeductionFeet;
    baseboardFeet += trimFeet;
    baseShoeboardFeet += trimFeet;
  });

  // Convert door widths map to array for easier display
  const doorSizes = Array.from(doorWidthsMap.entries()).map(([width, count]) => ({ 
    width, 
    count 
  })).sort((a, b) => a.width - b.width);

  return {
    widthWarnings,
    baseboardFeet,
    baseShoeboardFeet,
    doorCount,
    windowCount,
    doorSizes,
    totalWallLengthFeet,
    totalArea
  };
};