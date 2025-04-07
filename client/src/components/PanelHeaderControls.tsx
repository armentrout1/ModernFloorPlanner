import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PanelHeaderControlsProps {
  leftPanelTitle: string;
  rightPanelTitle: string;
  leftPanelExpanded: boolean;
  rightPanelExpanded: boolean;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  onToggleLeftPanel: (collapsed: boolean) => void;
  onToggleRightPanel: (collapsed: boolean) => void;
  onExpandLeftPanel: () => void;
  onExpandRightPanel: () => void;
}

const PanelHeaderControls: React.FC<PanelHeaderControlsProps> = ({
  leftPanelTitle,
  rightPanelTitle,
  leftPanelExpanded,
  rightPanelExpanded,
  leftCollapsed,
  rightCollapsed,
  onToggleLeftPanel,
  onToggleRightPanel,
  onExpandLeftPanel,
  onExpandRightPanel,
}) => {
  return (
    <div className="bg-gray-50 border-b border-slate-200 h-8 flex justify-between items-center px-4 relative z-10">
      {/* Left Controls */}
      {!leftCollapsed && (
        <div className="flex space-x-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onExpandLeftPanel}
                  className="w-7 h-7 bg-white rounded flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-200"
                >
                  <ChevronsLeft className={cn("h-4 w-4", leftPanelExpanded ? "rotate-180" : "")} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{leftPanelExpanded ? "Reset Panel Size" : "Expand Full"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onToggleLeftPanel(true)}
                  className="w-7 h-7 bg-white rounded flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-200"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Collapse {leftPanelTitle}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      
      {/* Spacer */}
      <div className="flex-grow"></div>
      
      {/* Right Controls */}
      {!rightCollapsed && (
        <div className="flex space-x-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onToggleRightPanel(true)}
                  className="w-7 h-7 bg-white rounded flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-200"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Collapse {rightPanelTitle}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onExpandRightPanel}
                  className="w-7 h-7 bg-white rounded flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-200"
                >
                  <ChevronsRight className={cn("h-4 w-4", rightPanelExpanded ? "rotate-180" : "")} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{rightPanelExpanded ? "Reset Panel Size" : "Expand Full"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      
      {/* Collapsed Panel Controls */}
      {leftCollapsed && (
        <div className="flex">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onToggleLeftPanel(false)}
                  className="w-7 h-7 bg-white rounded flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-200"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Expand {leftPanelTitle}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      
      {rightCollapsed && (
        <div className="flex ml-auto">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onToggleRightPanel(false)}
                  className="w-7 h-7 bg-white rounded flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-200"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Expand {rightPanelTitle}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
};

export default PanelHeaderControls;