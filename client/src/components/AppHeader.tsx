import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Calculator, CircleHelp, Keyboard, LayoutGrid, Search, Undo2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import AccountControls from '@/features/account/AccountControls';
import PlanTitleEditor from '@/components/PlanTitleEditor';
import PlanMenu from '@/components/PlanMenu';
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
  onShowCommandSearch: () => void;
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
  onShowCommandSearch,
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
      <nav data-testid="editor-action-row" aria-label="Floor plan actions" className="mt-2 min-w-0 border-t border-slate-100 pt-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <PlanMenu
              canSave={canSave}
              onNewPlan={onNewSketch}
              onOpenPlan={onLoadSketch}
              onSavePlan={onSaveSketch}
              onOpenPhysicalCopy={onOpenPhysicalCopy}
            />
            <Button asChild variant="outline" size="sm">
              <Link href="/quick-room" aria-label="Quick Rooms" className="gap-2">
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Quick Rooms</span>
              </Link>
            </Button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={onUndoDelete} disabled={!canUndoDelete} variant="outline" size="sm"
              className="gap-2" aria-label="Undo delete" title="Restore the last deletion (Ctrl/Cmd+Z)">
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">Undo delete</span>
            </Button>
            <Button
              onClick={onToggleMaterialPanel}
              variant={showMaterialPanel ? "default" : "outline"}
              size="sm"
              className="gap-2"
              aria-label="Materials"
            >
              <Calculator className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Materials</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Help" title="Help">
                  <CircleHelp className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[60] w-52 bg-white">
                <DropdownMenuItem onSelect={onShowKeyboardShortcuts}>
                  <Keyboard aria-hidden="true" />
                  Keyboard shortcuts
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onShowCommandSearch}>
                  <Search aria-hidden="true" />
                  Search tools and commands
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </nav>
    </header>
  );
};

export default AppHeader;
