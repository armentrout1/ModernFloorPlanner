export interface Room {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  color?: string;
  objects?: RoomObject[];
}

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type WallSide = 'top' | 'right' | 'bottom' | 'left';

export type ObjectType = 'door' | 'window';

export interface RoomObject {
  id: string;
  type: ObjectType;
  wallSide: WallSide;
  position: number; // Percentage along the wall (0-100)
  size: number; // Size in pixels
}

export interface CanvasState {
  rooms: Room[];
  selectedRoomIds: string[]; // Changed from selectedRoomId for multi-select support
  selectedRoomId: string | null; // Kept for backward compatibility
  selectedObjectId: string | null;
  scale: number;
  offset: Position;
  isDragging: boolean;
  isResizing: boolean;
  isDrawing: boolean;
  isPanning: boolean;
  isSelecting: boolean; // For drag-select rectangle
  selectStart: Position | null; // Starting position of selection rectangle
  selectEnd: Position | null; // Ending position of selection rectangle
  drawStart: Position | null;
  drawEnd: Position | null;
  lastMouse: Position;
  activeResizeHandle: string | null;
  activeTool: string;
  placingObjectType: ObjectType | null;
  isPreviewMode: boolean; // For quick preview visualization
}

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';
