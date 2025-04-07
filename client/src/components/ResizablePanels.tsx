import React, { ReactNode } from "react";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  ImperativePanelHandle
} from "react-resizable-panels";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
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
  className
}: ResizablePanelsProps) {
  const leftPanelRef = React.useRef<ImperativePanelHandle>(null);
  const rightPanelRef = React.useRef<ImperativePanelHandle>(null);
  const [leftCollapsed, setLeftCollapsed] = React.useState(false);
  const [rightCollapsed, setRightCollapsed] = React.useState(false);

  const toggleLeftPanel = () => {
    const panel = leftPanelRef.current;
    if (panel) {
      if (panel.getSize() < 1) {
        panel.resize(leftPanelWidth);
        setLeftCollapsed(false);
      } else {
        panel.resize(0);
        setLeftCollapsed(true);
      }
    }
  };

  const expandLeftPanelFull = () => {
    const panel = leftPanelRef.current;
    if (panel) {
      panel.resize(70); // Expand to take most of the screen
    }
  };

  const toggleRightPanel = () => {
    const panel = rightPanelRef.current;
    if (panel) {
      if (panel.getSize() < 1) {
        panel.resize(rightPanelWidth);
        setRightCollapsed(false);
      } else {
        panel.resize(0);
        setRightCollapsed(true);
      }
    }
  };
  
  const expandRightPanelFull = () => {
    const panel = rightPanelRef.current;
    if (panel) {
      panel.resize(70); // Expand to take most of the screen
    }
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Left panel controls - always visible */}
      <div className="absolute top-4 left-4 z-20 flex gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleLeftPanel}
                className="w-8 h-8 bg-white shadow-md rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className={cn("h-4 w-4 transition-transform", leftCollapsed ? "rotate-180" : "")} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{leftCollapsed ? "Expand Tools Panel" : "Collapse Tools Panel"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        {!leftCollapsed && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={expandLeftPanelFull}
                  className="w-8 h-8 bg-white shadow-md rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Expand Tools Panel Full</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      
      {/* Right panel controls - always visible */}
      <div className="absolute top-4 right-4 z-20 flex gap-2">
        {!rightCollapsed && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={expandRightPanelFull}
                  className="w-8 h-8 bg-white shadow-md rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Expand Properties Panel Full</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleRightPanel}
                className="w-8 h-8 bg-white shadow-md rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
              >
                <ChevronRight className={cn("h-4 w-4 transition-transform", rightCollapsed ? "rotate-180" : "")} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>{rightCollapsed ? "Expand Properties Panel" : "Collapse Properties Panel"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      <PanelGroup direction="horizontal" className="h-full">
        <Panel
          ref={leftPanelRef}
          defaultSize={leftPanelWidth}
          minSize={leftPanelMinSize}
          collapsible
          onCollapse={() => setLeftCollapsed(true)}
          onExpand={() => setLeftCollapsed(false)}
          className="bg-white"
        >
          <div className="flex flex-col h-full border-r border-gray-200">
            <div className="flex-grow overflow-auto p-2 pt-12"> {/* Added padding-top for controls */}
              {leftPanel}
            </div>
          </div>
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
          onCollapse={() => setRightCollapsed(true)}
          onExpand={() => setRightCollapsed(false)}
          className="bg-white"
        >
          <div className="flex flex-col h-full border-l border-gray-200">
            <div className="flex-grow overflow-auto p-2 pt-12"> {/* Added padding-top for controls */}
              {rightPanel}
            </div>
          </div>
        </Panel>
      </PanelGroup>

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