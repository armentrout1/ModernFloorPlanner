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
      <div className="flex min-w-0 flex-wrap items-center gap-2 xl:flex-nowrap">
        <h1 className="shrink-0 text-xl font-bold text-primary">Modern Floor Planner</h1>
        <span className="hidden h-7 w-px bg-slate-200 sm:block" aria-hidden="true" />
        <PlanTitleEditor
          sketchId={currentSketchId}
          value={currentSketchName}
          onChange={onSketchNameChange}
          onSaved={onSketchNameSaved}
        />
        <nav aria-label="Floor plan actions" className="order-3 flex w-full flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-2 xl:order-none xl:w-auto xl:flex-nowrap xl:border-0 xl:pt-0">
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
          className="bg-primary hover:bg-primary/90 text-white flex items-center"
        >
          <FileIcon className="mr-2 h-4 w-4" />
          New Sketch
        </Button>
        </nav>
        <AccountControls />
      </div>
    </header>
  );
};

export default AppHeader;
