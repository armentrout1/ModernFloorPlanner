import { DoorOpenIcon, Move, Square, type LucideIcon } from 'lucide-react';

export interface PrimaryEditorTool {
  id: 'move' | 'room' | 'door' | 'window';
  label: string;
  description: string;
  statusHint: string;
  icon: LucideIcon;
  group: 'drawing' | 'objects';
}

export const PRIMARY_EDITOR_TOOLS: readonly PrimaryEditorTool[] = [
  { id: 'move', label: 'Select & Move', description: 'Select and move rooms or objects (M)', statusHint: 'Drag on the grid to select; Shift-click adds or removes rooms.', icon: Move, group: 'drawing' },
  { id: 'room', label: 'Draw Room', description: 'Click and drag to draw a room (R)', statusHint: 'Click and drag on the grid to draw a room.', icon: Square, group: 'drawing' },
  { id: 'door', label: 'Add Door', description: 'Select a wall to place a door (D)', statusHint: 'Click a room wall to place a door.', icon: DoorOpenIcon, group: 'objects' },
  { id: 'window', label: 'Add Window', description: 'Select a wall to place a window (W)', statusHint: 'Click a room wall to place a window.', icon: Square, group: 'objects' },
] as const;
