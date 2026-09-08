import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { FileIcon, SaveIcon, FolderOpenIcon, CalculatorIcon, Keyboard } from 'lucide-react';

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
  onShowKeyboardShortcuts
}) => {
  return (
    <header className="bg-white shadow-sm border-b border-slate-200 px-4 py-3 flex flex-wrap gap-3 justify-between items-center">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-bold text-primary">Modern Floor Planner</h1>
        <Button asChild variant="outline"><Link href="/quick-room">Quick Rooms</Link></Button>
        <Button variant="outline" onClick={onOpenPhysicalCopy} disabled={!canSave}>Open a physical copy</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onUndoDelete} disabled={!canUndoDelete} variant="outline" title="Restore the last deletion (Ctrl/Cmd+Z)">Undo delete</Button>
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
          className="flex items-center"
        >
          <CalculatorIcon className="mr-2 h-4 w-4" />
          Materials
        </Button>
      
        <Button 
          onClick={onLoadSketch}
          variant="outline"
          className="flex items-center"
        >
          <FolderOpenIcon className="mr-2 h-4 w-4" />
          Load Sketch
        </Button>
        
        <Button 
          onClick={onSaveSketch}
          variant="outline"
          className="flex items-center"
          disabled={!canSave}
        >
          <SaveIcon className="mr-2 h-4 w-4" />
          Save Sketch
        </Button>
        
        <Button 
          onClick={onNewSketch}
          className="bg-primary hover:bg-primary/90 text-white flex items-center"
        >
          <FileIcon className="mr-2 h-4 w-4" />
          New Sketch
        </Button>
      </div>
    </header>
  );
};

export default AppHeader;
