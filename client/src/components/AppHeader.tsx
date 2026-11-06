import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { FileIcon, SaveIcon, FolderOpenIcon, CalculatorIcon, Keyboard } from 'lucide-react';
import AccountControls from '@/features/account/AccountControls';
import PlanTitleEditor from '@/components/PlanTitleEditor';
import type { SavedSketch } from '@/utils/api';

interface AppHeaderProps {
  onOpenPhysicalCopy: () => void;
  onUndoDelete: () => void;
  canUndoDelete: boolean;
  onNewSketch: () => void;
  onSaveSketch: () => void;
  onLoadSketch: () => void;
  onToggleMaterialPanel: () => void;
  showMaterialPanel: boolean;
  canSave: boolean;
  onShowKeyboardShortcuts: () => void;
  currentSketchId?: number;
  currentSketchName: string;
  onSketchNameChange: (name: string) => void;
  onSketchNameSaved: (sketch: SavedSketch) => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({ 
  onOpenPhysicalCopy,
  onUndoDelete,
  canUndoDelete,
  onNewSketch, 
  onSaveSketch, 
  onLoadSketch,
  onToggleMaterialPanel,
  showMaterialPanel,
  canSave,
  onShowKeyboardShortcuts,
  currentSketchId,
  currentSketchName,
  onSketchNameChange,
  onSketchNameSaved,
}) => {
  return (
    <header className="border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
      <div data-testid="editor-identity-row" className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex shrink-0 items-center gap-2">
          <h1 aria-label="Modern Floor Planner" className="text-base font-bold text-primary sm:text-xl">
            <span className="hidden sm:inline">Modern Floor Planner</span>
            <span className="sm:hidden" aria-hidden="true">MFP</span>
          </h1>
          <span className="h-7 w-px bg-slate-200" aria-hidden="true" />
        </div>
        <PlanTitleEditor
          sketchId={currentSketchId}
          value={currentSketchName}
          onChange={onSketchNameChange}
          onSaved={onSketchNameSaved}
        />
        <AccountControls />
      </div>
      <nav data-testid="editor-action-row" aria-label="Floor plan actions" className="mt-2 w-full min-w-0 overflow-x-auto border-t border-slate-100 pt-2">
        <div className="ml-auto flex w-max min-w-full items-center justify-end gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/quick-room">Quick Rooms</Link></Button>
          <Button variant="outline" size="sm" onClick={onOpenPhysicalCopy} disabled={!canSave}>Open a physical copy</Button>
          <Button onClick={onUndoDelete} disabled={!canUndoDelete} variant="outline" size="sm" title="Restore the last deletion (Ctrl/Cmd+Z)">Undo delete</Button>
          <Button
            onClick={onShowKeyboardShortcuts}
            variant="outline"
            size="sm"
            className="flex items-center"
            title="Keyboard Shortcuts"
          >
            <Keyboard className="h-4 w-4" />
          </Button>

          <Button
            onClick={onToggleMaterialPanel}
            variant={showMaterialPanel ? "default" : "outline"}
            size="sm"
            className="flex items-center"
          >
            <CalculatorIcon className="mr-2 h-4 w-4" />
            Materials
          </Button>

          <Button
            onClick={onLoadSketch}
            variant="outline"
            size="sm"
            className="flex items-center"
          >
            <FolderOpenIcon className="mr-2 h-4 w-4" />
            Load Sketch
          </Button>

          <Button
            onClick={onSaveSketch}
            variant="outline"
            size="sm"
            className="flex items-center"
            disabled={!canSave}
          >
            <SaveIcon className="mr-2 h-4 w-4" />
            Save Sketch
          </Button>

          <Button
            onClick={onNewSketch}
            size="sm"
            className="flex items-center bg-primary text-white hover:bg-primary/90"
          >
            <FileIcon className="mr-2 h-4 w-4" />
            New Sketch
          </Button>
        </div>
      </nav>
    </header>
  );
};

export default AppHeader;
