export interface Room {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  color?: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface CanvasState {
  rooms: Room[];
  selectedRoomId: string | null;
  scale: number;
  offset: Position;
  isDragging: boolean;
  isResizing: boolean;
  isDrawing: boolean;
  drawStart: Position | null;
  drawEnd: Position | null;
  lastMouse: Position;
  activeResizeHandle: string | null;
}

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';
