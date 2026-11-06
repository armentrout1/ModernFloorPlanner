import {
  ChevronsLeftRight,
  ChevronsUpDown,
  DoorOpenIcon,
  Eye,
  FlipHorizontal,
  FlipVertical,
  LayoutGrid,
  LayoutTemplate,
  ListChecks,
  Move,
  Square,
  type LucideIcon,
} from 'lucide-react';

export type EditorToolId = 'move' | 'room' | 'door' | 'window';
export type EditorActionId =
  | 'auto-align'
  | 'distribute-horizontal'
  | 'distribute-vertical'
  | 'mirror-horizontal'
  | 'mirror-vertical'
  | 'center-room';
export type EditorCommandId = EditorToolId | EditorActionId | 'select-all' | 'toggle-room-names';
export type EditorCommandGroup = 'drawing' | 'objects' | 'selection' | 'alignment' | 'transform';
export type EditorCommandAvailability =
  | 'always'
  | 'has-rooms'
  | 'two-ungrouped-rooms'
  | 'three-ungrouped-rooms'
  | 'one-ungrouped-room';

interface EditorCommandBase {
  id: EditorCommandId;
  label: string;
  icon: LucideIcon;
  group: EditorCommandGroup;
  shortcut?: string;
  help: string;
  aliases: readonly string[];
  availability: EditorCommandAvailability;
  risk: 'safe';
}

export interface EditorToolCommand extends EditorCommandBase {
  id: EditorToolId;
  kind: 'tool';
  shortcut: string;
  description: string;
  statusHint: string;
  primary: true;
}

export interface EditorActionCommand extends EditorCommandBase {
  id: EditorActionId;
  kind: 'action';
  actionId: EditorActionId;
}

export interface EditorUtilityCommand extends EditorCommandBase {
  id: 'select-all' | 'toggle-room-names';
  kind: 'utility';
}

export type EditorCommand = EditorToolCommand | EditorActionCommand | EditorUtilityCommand;

export interface EditorCommandContext {
  roomCount: number;
  selectionCount: number;
  hasGroupedRooms: boolean;
  selectedRoomIsGrouped: boolean;
  showRoomNames: boolean;
}

export interface CommandAvailabilityResult {
  available: boolean;
  reason?: string;
}

export const EDITOR_COMMAND_GROUPS: readonly { id: EditorCommandGroup; label: string }[] = [
  { id: 'drawing', label: 'Drawing tools' },
  { id: 'objects', label: 'Room objects' },
  { id: 'selection', label: 'Selection and view' },
  { id: 'alignment', label: 'Room alignment' },
  { id: 'transform', label: 'Room transform' },
] as const;

export const EDITOR_COMMANDS: readonly EditorCommand[] = [
  {
    id: 'move', kind: 'tool', primary: true, label: 'Select & Move', icon: Move, group: 'drawing', shortcut: 'M',
    description: 'Select and move rooms or objects (M)',
    help: 'Select, move or multi-select rooms and openings.',
    statusHint: 'Drag on the grid to select; Shift-click adds or removes rooms.',
    aliases: ['pointer', 'cursor', 'choose', 'drag'], availability: 'always', risk: 'safe',
  },
  {
    id: 'room', kind: 'tool', primary: true, label: 'Draw Room', icon: Square, group: 'drawing', shortcut: 'R',
    description: 'Click and drag to draw a room (R)', help: 'Draw a new room on the canvas.',
    statusHint: 'Click and drag on the grid to draw a room.',
    aliases: ['space', 'area', 'wall', 'rectangle'], availability: 'always', risk: 'safe',
  },
  {
    id: 'door', kind: 'tool', primary: true, label: 'Add Door', icon: DoorOpenIcon, group: 'objects', shortcut: 'D',
    description: 'Select a wall to place a door (D)', help: 'Place a door opening on a room wall.',
    statusHint: 'Click a room wall to place a door.',
    aliases: ['opening', 'entry', 'entrance'], availability: 'always', risk: 'safe',
  },
  {
    id: 'window', kind: 'tool', primary: true, label: 'Add Window', icon: Square, group: 'objects', shortcut: 'W',
    description: 'Select a wall to place a window (W)', help: 'Place a window opening on a room wall.',
    statusHint: 'Click a room wall to place a window.',
    aliases: ['opening', 'glass'], availability: 'always', risk: 'safe',
  },
  {
    id: 'select-all', kind: 'utility', label: 'Select all rooms', icon: ListChecks, group: 'selection', shortcut: 'Ctrl/Cmd+A',
    help: 'Select every room in the current plan.', aliases: ['everything', 'all spaces'],
    availability: 'has-rooms', risk: 'safe',
  },
  {
    id: 'toggle-room-names', kind: 'utility', label: 'Show or hide room names', icon: Eye, group: 'selection',
    help: 'Change whether room names are visible on the canvas.', aliases: ['labels', 'titles', 'room text'],
    availability: 'always', risk: 'safe',
  },
  {
    id: 'auto-align', kind: 'action', actionId: 'auto-align', label: 'Auto-Align Rooms', icon: LayoutTemplate, group: 'alignment',
    help: 'Automatically align room edges.', aliases: ['straighten', 'line up', 'snap rooms'],
    availability: 'two-ungrouped-rooms', risk: 'safe',
  },
  {
    id: 'distribute-horizontal', kind: 'action', actionId: 'distribute-horizontal', label: 'Distribute Horizontally',
    icon: ChevronsLeftRight, group: 'alignment', help: 'Space rooms evenly from left to right.',
    aliases: ['space evenly', 'horizontal spacing', 'spread across'], availability: 'three-ungrouped-rooms', risk: 'safe',
  },
  {
    id: 'distribute-vertical', kind: 'action', actionId: 'distribute-vertical', label: 'Distribute Vertically',
    icon: ChevronsUpDown, group: 'alignment', help: 'Space rooms evenly from top to bottom.',
    aliases: ['space evenly', 'vertical spacing', 'spread down'], availability: 'three-ungrouped-rooms', risk: 'safe',
  },
  {
    id: 'mirror-horizontal', kind: 'action', actionId: 'mirror-horizontal', label: 'Mirror Horizontally',
    icon: FlipHorizontal, group: 'transform', help: 'Flip one selected room from left to right.',
    aliases: ['flip', 'reverse', 'left right'], availability: 'one-ungrouped-room', risk: 'safe',
  },
  {
    id: 'mirror-vertical', kind: 'action', actionId: 'mirror-vertical', label: 'Mirror Vertically',
    icon: FlipVertical, group: 'transform', help: 'Flip one selected room from top to bottom.',
    aliases: ['flip', 'reverse', 'top bottom'], availability: 'one-ungrouped-room', risk: 'safe',
  },
  {
    id: 'center-room', kind: 'action', actionId: 'center-room', label: 'Reposition Room', icon: LayoutGrid, group: 'transform',
    help: 'Move one selected room toward the center of the canvas.', aliases: ['center room', 'move to center', 'reposition'],
    availability: 'one-ungrouped-room', risk: 'safe',
  },
] as const;

export const PRIMARY_EDITOR_TOOLS = EDITOR_COMMANDS.filter(
  (command): command is EditorToolCommand => command.kind === 'tool' && command.primary,
);

export function getEditorCommand(id: EditorCommandId): EditorCommand {
  const command = EDITOR_COMMANDS.find(candidate => candidate.id === id);
  if (!command) throw new Error(`Unknown editor command: ${id}`);
  return command;
}

export function getEditorCommandLabel(command: EditorCommand, context: EditorCommandContext): string {
  if (command.id === 'toggle-room-names') return context.showRoomNames ? 'Hide room names' : 'Show room names';
  return command.label;
}

export function getEditorCommandAvailability(
  command: EditorCommand,
  context: EditorCommandContext,
): CommandAvailabilityResult {
  switch (command.availability) {
    case 'always':
      return { available: true };
    case 'has-rooms':
      return context.roomCount > 0 ? { available: true } : { available: false, reason: 'Draw a room first.' };
    case 'two-ungrouped-rooms':
      if (context.hasGroupedRooms) return { available: false, reason: 'Ungroup rooms before aligning them.' };
      return context.roomCount >= 2 ? { available: true } : { available: false, reason: 'Add at least two rooms.' };
    case 'three-ungrouped-rooms':
      if (context.hasGroupedRooms) return { available: false, reason: 'Ungroup rooms before distributing them.' };
      return context.roomCount >= 3 ? { available: true } : { available: false, reason: 'Add at least three rooms.' };
    case 'one-ungrouped-room':
      if (context.selectionCount !== 1) return { available: false, reason: 'Select one room.' };
      if (context.selectedRoomIsGrouped) return { available: false, reason: 'Ungroup the room before transforming it.' };
      return { available: true };
  }
}
