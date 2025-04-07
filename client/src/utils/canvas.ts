import { Position, Room, Size } from './types';

export const GRID_SIZE = 20; // pixels
export const ROOM_MIN_SIZE = 60; // pixels
export const SCALE_FACTOR = 1.2;
export const FEET_PER_GRID = 1; // 1 grid = 1 foot

// Snap a coordinate to the grid
export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

// Convert pixels to feet
export function pixelsToFeet(pixels: number): number {
  return (pixels / GRID_SIZE) * FEET_PER_GRID;
}

// Convert feet to pixels
export function feetToPixels(feet: number): number {
  return (feet / FEET_PER_GRID) * GRID_SIZE;
}

// Format dimensions as feet
export function formatDimensions(width: number, height: number): string {
  const widthInFeet = pixelsToFeet(width).toFixed(1);
  const heightInFeet = pixelsToFeet(height).toFixed(1);
  return `${widthInFeet}' × ${heightInFeet}'`;
}

// Create a new room with default values
export function createRoom(
  x: number,
  y: number,
  width: number = ROOM_MIN_SIZE,
  height: number = ROOM_MIN_SIZE
): Room {
  return {
    id: generateId(),
    x: snapToGrid(x),
    y: snapToGrid(y),
    width: snapToGrid(Math.max(width, ROOM_MIN_SIZE)),
    height: snapToGrid(Math.max(height, ROOM_MIN_SIZE)),
    name: 'Room',
    color: '#93c5fd',
  };
}

// Generate a unique ID for a room
export function generateId(): string {
  return `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

// Calculate the position of a resize handle
export function getResizeHandlePosition(
  room: Room,
  handle: string,
  scale: number = 1
): Position {
  const { x, y, width, height } = room;
  
  switch (handle) {
    case 'nw':
      return { x, y };
    case 'ne':
      return { x: x + width, y };
    case 'sw':
      return { x, y: y + height };
    case 'se':
      return { x: x + width, y: y + height };
    default:
      return { x: 0, y: 0 };
  }
}

// Calculate new room dimensions when resizing
export function getResizedRoom(
  room: Room,
  handle: string,
  newPos: Position
): Room {
  const { id, x, y, width, height, name, color } = room;
  const snappedX = snapToGrid(newPos.x);
  const snappedY = snapToGrid(newPos.y);
  
  let newRoom = { ...room };
  
  switch (handle) {
    case 'nw':
      newRoom = {
        ...room,
        x: snappedX,
        y: snappedY,
        width: Math.max(x + width - snappedX, ROOM_MIN_SIZE),
        height: Math.max(y + height - snappedY, ROOM_MIN_SIZE),
      };
      break;
    case 'ne':
      newRoom = {
        ...room,
        y: snappedY,
        width: Math.max(snappedX - x, ROOM_MIN_SIZE),
        height: Math.max(y + height - snappedY, ROOM_MIN_SIZE),
      };
      break;
    case 'sw':
      newRoom = {
        ...room,
        x: snappedX,
        width: Math.max(x + width - snappedX, ROOM_MIN_SIZE),
        height: Math.max(snappedY - y, ROOM_MIN_SIZE),
      };
      break;
    case 'se':
      newRoom = {
        ...room,
        width: Math.max(snappedX - x, ROOM_MIN_SIZE),
        height: Math.max(snappedY - y, ROOM_MIN_SIZE),
      };
      break;
  }
  
  return newRoom;
}
