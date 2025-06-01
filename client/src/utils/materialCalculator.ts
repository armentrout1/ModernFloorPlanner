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

import { Room, RoomObject } from './types';
import { pixelsToFeet, calculateRoomArea } from './canvas';

interface MaterialCalculations {
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

export const calculateMaterials = (
  rooms: Room[]
): MaterialCalculations => {
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

    // Count doors and windows
    if (room.objects && room.objects.length > 0) {
      room.objects.forEach((obj: RoomObject) => {
        if (obj.type === 'door') {
          doorCount++;
          
          // Calculate door width in feet and round to nearest 0.5
          const doorWidthFeet = Math.round(pixelsToFeet(obj.size) * 2) / 2;
          
          // Add to door widths map
          doorWidthsMap.set(
            doorWidthFeet, 
            (doorWidthsMap.get(doorWidthFeet) || 0) + 1
          );
          
          // Subtract door width from baseboard length
          baseboardFeet += perimeter - doorWidthFeet;
        } else if (obj.type === 'window') {
          windowCount++;
          
          // Windows don't affect baseboard, but we still count them
          baseboardFeet += perimeter;
        }
      });
    } else {
      // If no openings, use full perimeter
      baseboardFeet += perimeter;
    }
    
    // Base shoe is the same as baseboard but doesn't need to account for doors
    baseShoeboardFeet += perimeter;
  });

  // Convert door widths map to array for easier display
  const doorSizes = Array.from(doorWidthsMap.entries()).map(([width, count]) => ({ 
    width, 
    count 
  })).sort((a, b) => a.width - b.width);

  return {
    baseboardFeet,
    baseShoeboardFeet,
    doorCount,
    windowCount,
    doorSizes,
    totalWallLengthFeet,
    totalArea
  };
};