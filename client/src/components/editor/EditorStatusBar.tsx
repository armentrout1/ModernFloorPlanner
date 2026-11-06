import { calculateTotalArea, formatArea } from '@/utils/canvas';
import { Room } from '@/utils/types';
import { PRIMARY_EDITOR_TOOLS } from './editorToolDefinitions';

interface EditorStatusBarProps {
  rooms: Room[];
  activeTool: string;
  selectionCount: number;
}

export const EditorStatusBar = ({ rooms, activeTool, selectionCount }: EditorStatusBarProps) => {
  const totalArea = calculateTotalArea(rooms);
  const tool = PRIMARY_EDITOR_TOOLS.find(candidate => candidate.id === activeTool);
  const toolLabel = tool?.label ?? 'Canvas';
  const toolHint = tool?.statusHint ?? 'Choose a tool to begin.';

  return (
    <section data-testid="editor-status-bar" aria-label="Editor status"
      className="flex h-9 min-w-0 flex-1 items-center gap-2 overflow-hidden px-3 text-xs text-slate-600 sm:gap-3">
      <div data-testid="canvas-totals" className="flex shrink-0 items-center gap-2 tabular-nums">
        <span className="font-semibold text-primary">{formatArea(totalArea)}</span>
        <span aria-hidden="true" className="text-slate-300">•</span>
        <span>{rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}</span>
      </div>
      <span aria-hidden="true" className="hidden text-slate-300 sm:inline">|</span>
      <span className="min-w-0 truncate font-medium text-slate-800">{toolLabel}</span>
      <span className="hidden min-w-0 truncate lg:inline">{toolHint}</span>
      {selectionCount > 0 && (
        <span className="ml-auto shrink-0 rounded bg-slate-100 px-2 py-0.5 text-slate-700">
          {selectionCount} selected
        </span>
      )}
    </section>
  );
};
