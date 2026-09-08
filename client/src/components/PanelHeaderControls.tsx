import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PanelHeaderControlsProps {
  leftPanelTitle: string;
  rightPanelTitle: string;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  onToggleLeftPanel: (collapsed: boolean) => void;
  onToggleRightPanel: (collapsed: boolean) => void;
}

export default function PanelHeaderControls({ leftPanelTitle, rightPanelTitle,
  leftCollapsed, rightCollapsed, onToggleLeftPanel, onToggleRightPanel }: PanelHeaderControlsProps) {
  const LeftIcon = leftCollapsed ? ChevronRight : ChevronLeft;
  const RightIcon = rightCollapsed ? ChevronLeft : ChevronRight;
  return <div data-testid="panel-toggles" role="group" aria-label="Side panel controls"
    className="relative z-10 flex h-8 shrink-0 items-center justify-between border-b border-slate-200 bg-gray-50 px-4">
    <Button type="button" variant="outline" size="icon" className="h-7 w-7" data-testid="toggle-left-panel"
      aria-label={`${leftCollapsed ? 'Open' : 'Close'} left panel`} aria-expanded={!leftCollapsed}
      aria-controls="left-editor-panel-content" title={`${leftCollapsed ? 'Open' : 'Close'} ${leftPanelTitle}`}
      onClick={() => onToggleLeftPanel(!leftCollapsed)}>
      <LeftIcon aria-hidden="true" className="h-4 w-4" />
    </Button>
    <Button type="button" variant="outline" size="icon" className="h-7 w-7" data-testid="toggle-right-panel"
      aria-label={`${rightCollapsed ? 'Open' : 'Close'} right panel`} aria-expanded={!rightCollapsed}
      aria-controls="right-editor-panel-content" title={`${rightCollapsed ? 'Open' : 'Close'} ${rightPanelTitle}`}
      onClick={() => onToggleRightPanel(!rightCollapsed)}>
      <RightIcon aria-hidden="true" className="h-4 w-4" />
    </Button>
  </div>;
}
