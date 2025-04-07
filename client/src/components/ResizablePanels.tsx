import React, { ReactNode } from "react";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  ImperativePanelHandle
} from "react-resizable-panels";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ResizablePanelsProps {
  leftPanel: ReactNode;
  centerPanel: ReactNode;
  rightPanel: ReactNode;
  leftPanelWidth?: number;
  rightPanelWidth?: number;
  leftPanelTitle?: string;
  rightPanelTitle?: string;
  leftPanelMinSize?: number;
  rightPanelMinSize?: number;
  className?: string;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  onLeftCollapsedChange?: (collapsed: boolean) => void;
  onRightCollapsedChange?: (collapsed: boolean) => void;
}

export function ResizablePanels({
  leftPanel,
  centerPanel,
  rightPanel,
  leftPanelWidth = 20,
  rightPanelWidth = 25,
  leftPanelTitle = "Left Panel",
  rightPanelTitle = "Right Panel",
  leftPanelMinSize = 10,
  rightPanelMinSize = 10,
  className,
  leftCollapsed = false,
  rightCollapsed = false,
  onLeftCollapsedChange,
  onRightCollapsedChange
}: ResizablePanelsProps) {
  const leftPanelRef = React.useRef<ImperativePanelHandle>(null);
  const rightPanelRef = React.useRef<ImperativePanelHandle>(null);
  
  // Effect to sync panel state when props change
  React.useEffect(() => {
    const panel = leftPanelRef.current;
    if (panel) {
      if (leftCollapsed && panel.getSize() > 0) {
        panel.resize(0);
      } else if (!leftCollapsed && panel.getSize() < 1) {
        panel.resize(leftPanelWidth);
      }
    }
  }, [leftCollapsed, leftPanelWidth]);
  
  React.useEffect(() => {
    const panel = rightPanelRef.current;
    if (panel) {
      if (rightCollapsed && panel.getSize() > 0) {
        panel.resize(0);
      } else if (!rightCollapsed && panel.getSize() < 1) {
        panel.resize(rightPanelWidth);
      }
    }
  }, [rightCollapsed, rightPanelWidth]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <PanelGroup direction="horizontal" className="h-full">
        <Panel
          ref={leftPanelRef}
          defaultSize={leftPanelWidth}
          minSize={leftPanelMinSize}
          collapsible
          onCollapse={() => onLeftCollapsedChange?.(true)}
          onExpand={() => onLeftCollapsedChange?.(false)}
          className="bg-white"
        >
          {!leftCollapsed && (
            <div className="flex flex-col h-full border-r border-gray-200">
              {/* Left panel header with title */}
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
                <div className="font-medium text-sm text-gray-700">{leftPanelTitle}</div>
              </div>
              
              <div className="flex-grow overflow-auto p-2">
                {leftPanel}
              </div>
            </div>
          )}
        </Panel>

        <PanelResizeHandle className="cursor-col-resize">
          <div className="h-full"></div>
        </PanelResizeHandle>

        <Panel className="h-full">
          {centerPanel}
        </Panel>

        <PanelResizeHandle className="cursor-col-resize">
          <div className="h-full"></div>
        </PanelResizeHandle>

        <Panel
          ref={rightPanelRef}
          defaultSize={rightPanelWidth}
          minSize={rightPanelMinSize}
          collapsible
          onCollapse={() => onRightCollapsedChange?.(true)}
          onExpand={() => onRightCollapsedChange?.(false)}
          className="bg-white"
        >
          {!rightCollapsed && (
            <div className="flex flex-col h-full border-l border-gray-200">
              {/* Right panel header with title */}
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
                <div className="font-medium text-sm text-gray-700">{rightPanelTitle}</div>
              </div>
              
              <div className="flex-grow overflow-auto p-2">
                {rightPanel}
              </div>
            </div>
          )}
        </Panel>
      </PanelGroup>
      
      {/* Labels for collapsed panels */}
      {leftCollapsed && (
        <div className="absolute top-1/2 left-2 -translate-y-1/2 z-10">
          <div className="vertical-text text-xs text-gray-500 bg-white/80 py-4 px-1 rounded shadow-sm">
            {leftPanelTitle}
          </div>
        </div>
      )}
      
      {rightCollapsed && (
        <div className="absolute top-1/2 right-2 -translate-y-1/2 z-10">
          <div className="vertical-text text-xs text-gray-500 bg-white/80 py-4 px-1 rounded shadow-sm">
            {rightPanelTitle}
          </div>
        </div>
      )}
    </div>
  );
}