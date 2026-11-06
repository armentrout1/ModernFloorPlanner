import { DoorOpenIcon, Move, Square, type LucideIcon } from 'lucide-react';

export interface PrimaryEditorTool {
  id: 'move' | 'room' | 'door' | 'window';
  label: string;
  description: string;
  icon: LucideIcon;
  group: 'drawing' | 'objects';
}

export const PRIMARY_EDITOR_TOOLS: readonly PrimaryEditorTool[] = [
  { id: 'move', label: 'Select & Move', description: 'Select and move rooms or objects (M)', icon: Move, group: 'drawing' },
  { id: 'room', label: 'Draw Room', description: 'Click and drag to draw a room (R)', icon: Square, group: 'drawing' },
  { id: 'door', label: 'Add Door', description: 'Select a wall to place a door (D)', icon: DoorOpenIcon, group: 'objects' },
  { id: 'window', label: 'Add Window', description: 'Select a wall to place a window (W)', icon: Square, group: 'objects' },
] as const;
