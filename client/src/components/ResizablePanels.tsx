import React, { ReactNode } from "react";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  ImperativePanelHandle
} from "react-resizable-panels";
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
  
  const leftHasOpened = React.useRef(!leftCollapsed);
  const rightHasOpened = React.useRef(!rightCollapsed);
  // collapse/expand remember the user's width; resize(0) plus defaultSize does not.
  React.useEffect(() => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    if (leftCollapsed && !panel.isCollapsed()) panel.collapse();
    else if (!leftCollapsed && panel.isCollapsed()) panel.expand(leftHasOpened.current ? undefined : leftPanelWidth);
  }, [leftCollapsed, leftPanelWidth]);
  React.useEffect(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (rightCollapsed && !panel.isCollapsed()) panel.collapse();
    else if (!rightCollapsed && panel.isCollapsed()) panel.expand(rightHasOpened.current ? undefined : rightPanelWidth);
  }, [rightCollapsed, rightPanelWidth]);

  return (
    <div className={cn("flex min-h-0 flex-col h-full", className)}>
      <PanelGroup direction="horizontal" className="h-full">
        <Panel
          id="left-panel" order={0} data-testid="left-editor-panel"
          ref={leftPanelRef}
          defaultSize={leftCollapsed ? 0 : leftPanelWidth}
          minSize={leftPanelMinSize}
          collapsible collapsedSize={0}
          onCollapse={() => onLeftCollapsedChange?.(true)}
          onExpand={() => { leftHasOpened.current = true; onLeftCollapsedChange?.(false); }}
          className="bg-white"
        >
          <div id="left-editor-panel-content" className="flex min-h-0 flex-col h-full border-r border-gray-200"
            style={{ display: leftCollapsed ? 'none' : undefined }}>
              {/* Left panel header with title */}
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
                <div className="font-medium text-sm text-gray-700">{leftPanelTitle}</div>
              </div>
              
              <div className="min-h-0 flex-1 overflow-hidden p-2">
                {leftPanel}
              </div>
            </div>
        </Panel>

        <PanelResizeHandle data-testid="left-panel-resizer" disabled={leftCollapsed}
          className={leftCollapsed ? "hidden" : "w-1 bg-slate-100 hover:bg-slate-300 cursor-col-resize"} />

        <Panel id="canvas-panel" order={1} className="h-full">
          {centerPanel}
        </Panel>

        <PanelResizeHandle data-testid="right-panel-resizer" disabled={rightCollapsed}
          className={rightCollapsed ? "hidden" : "w-1 bg-slate-100 hover:bg-slate-300 cursor-col-resize"} />

        <Panel
          id="right-panel" order={2} data-testid="right-editor-panel"
          ref={rightPanelRef}
          defaultSize={rightCollapsed ? 0 : rightPanelWidth}
          minSize={rightPanelMinSize}
          collapsible collapsedSize={0}
          onCollapse={() => onRightCollapsedChange?.(true)}
          onExpand={() => { rightHasOpened.current = true; onRightCollapsedChange?.(false); }}
          className="bg-white"
        >
          <div id="right-editor-panel-content" className="flex min-h-0 flex-col h-full border-l border-gray-200"
            style={{ display: rightCollapsed ? 'none' : undefined }}>
              {/* Right panel header with title */}
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
                <div className="font-medium text-sm text-gray-700">{rightPanelTitle}</div>
              </div>
              
              <div className="min-h-0 flex-1 overflow-hidden p-2">
                {rightPanel}
              </div>
            </div>
        </Panel>
      </PanelGroup>
      
      {/* Children stay mounted while hidden, preserving tab context and field drafts. */}
    </div>
  );
}