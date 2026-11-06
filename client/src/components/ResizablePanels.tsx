import React, { type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  clampLeftPanelWidth,
  type EditorLeftMode,
} from '@/components/editor/editorLayout';

interface ResizablePanelsProps {
  leftPanel: ReactNode;
  leftRail: ReactNode;
  centerPanel: ReactNode;
  rightPanel: ReactNode;
  leftMode: EditorLeftMode;
  leftExpandedWidth: number;
  isPhone: boolean;
  layoutAnnouncement?: string;
  rightPanelWidth?: number;
  leftPanelTitle?: string;
  rightPanelTitle?: string;
  rightPanelMinSize?: number;
  className?: string;
  rightCollapsed?: boolean;
  onCycleLeftMode: () => void;
  onLeftExpandedWidthChange: (width: number) => void;
  onLeftModeChange: (mode: EditorLeftMode) => void;
  onRightCollapsedChange?: (collapsed: boolean) => void;
}

const RAIL_WIDTH = 56;
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function leftToggleLabel(mode: EditorLeftMode): string {
  if (mode === 'expanded') return 'Collapse tools to icons';
  if (mode === 'rail') return 'Hide tools';
  return 'Expand tools';
}

export function ResizablePanels({
  leftPanel,
  leftRail,
  centerPanel,
  rightPanel,
  leftMode,
  leftExpandedWidth,
  isPhone,
  layoutAnnouncement = '',
  rightPanelWidth = 25,
  leftPanelTitle = 'Tools & Actions',
  rightPanelTitle = 'Right Panel',
  rightPanelMinSize = 10,
  className,
  rightCollapsed = false,
  onCycleLeftMode,
  onLeftExpandedWidthChange,
  onLeftModeChange,
  onRightCollapsedChange,
}: ResizablePanelsProps) {
  const rightPanelRef = React.useRef<ImperativePanelHandle>(null);
  const leftPanelRef = React.useRef<HTMLElement>(null);
  const rightHasOpened = React.useRef(!rightCollapsed);
  const resizeStart = React.useRef({ x: 0, width: leftExpandedWidth });
  const latestResizeWidth = React.useRef(leftExpandedWidth);
  const [isResizingLeft, setIsResizingLeft] = React.useState(false);
  const [liveLeftWidth, setLiveLeftWidth] = React.useState<number | null>(null);

  React.useEffect(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (rightCollapsed && !panel.isCollapsed()) panel.collapse();
    else if (!rightCollapsed && panel.isCollapsed()) panel.expand(rightHasOpened.current ? undefined : rightPanelWidth);
  }, [rightCollapsed, rightPanelWidth]);

  React.useEffect(() => {
    if (!isResizingLeft) return;
    const move = (clientX: number) => {
      const width = clampLeftPanelWidth(resizeStart.current.width + clientX - resizeStart.current.x);
      latestResizeWidth.current = width;
      setLiveLeftWidth(width);
    };
    const mouseMove = (event: MouseEvent) => move(event.clientX);
    const touchMove = (event: TouchEvent) => {
      if (!event.touches.length) return;
      event.preventDefault();
      move(event.touches[0].clientX);
    };
    const finish = () => {
      setIsResizingLeft(false);
      setLiveLeftWidth(null);
      onLeftExpandedWidthChange(latestResizeWidth.current);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', mouseMove);
    document.addEventListener('mouseup', finish);
    document.addEventListener('touchmove', touchMove, { passive: false });
    document.addEventListener('touchend', finish);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', mouseMove);
      document.removeEventListener('mouseup', finish);
      document.removeEventListener('touchmove', touchMove);
      document.removeEventListener('touchend', finish);
    };
  }, [isResizingLeft, onLeftExpandedWidthChange]);

  const phoneOverlayOpen = isPhone && leftMode === 'expanded';
  React.useEffect(() => {
    if (!phoneOverlayOpen) return;
    const panel = leftPanelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    requestAnimationFrame(() => first?.focus({ preventScroll: true }));
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onLeftModeChange('hidden');
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(element => element.getClientRects().length > 0);
      if (!controls.length) return;
      const firstControl = controls[0], lastControl = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === firstControl) {
        event.preventDefault(); lastControl.focus();
      } else if (!event.shiftKey && document.activeElement === lastControl) {
        event.preventDefault(); firstControl.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="toggle-left-panel"]')?.focus({ preventScroll: true }));
    };
  }, [phoneOverlayOpen, onLeftModeChange]);

  const displayLeftWidth = liveLeftWidth ?? leftExpandedWidth;
  const dockedLeftWidth = phoneOverlayOpen ? 0 : leftMode === 'expanded' ? displayLeftWidth : leftMode === 'rail' ? RAIL_WIDTH : 0;
  const toggleLabel = leftToggleLabel(leftMode);

  const beginMouseResize = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeStart.current = { x: event.clientX, width: displayLeftWidth };
    latestResizeWidth.current = displayLeftWidth;
    setIsResizingLeft(true);
  };
  const beginTouchResize = (event: React.TouchEvent) => {
    if (!event.touches.length) return;
    resizeStart.current = { x: event.touches[0].clientX, width: displayLeftWidth };
    latestResizeWidth.current = displayLeftWidth;
    setIsResizingLeft(true);
  };

  return <div className={cn('relative flex h-full min-h-0 min-w-0 overflow-hidden', className)} data-testid="editor-shell">
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{layoutAnnouncement}</p>

    {phoneOverlayOpen && <button type="button" aria-label="Close tools overlay"
      className="absolute inset-0 z-20 bg-slate-950/25" onClick={() => onLeftModeChange('hidden')} />}

    <aside ref={leftPanelRef} data-testid="left-editor-panel" data-left-mode={leftMode}
      aria-label={phoneOverlayOpen ? leftPanelTitle : undefined}
      role={phoneOverlayOpen ? 'dialog' : undefined}
      aria-modal={phoneOverlayOpen ? true : undefined}
      className={cn('bg-white transition-[width] duration-150 motion-reduce:transition-none',
        phoneOverlayOpen ? 'absolute inset-y-0 left-0 z-30 border-r border-slate-200 shadow-xl' : 'relative z-10 shrink-0 overflow-hidden')}
      style={phoneOverlayOpen
        ? { width: displayLeftWidth, maxWidth: 'calc(100% - 48px)' }
        : { width: dockedLeftWidth }}>
      <div id="left-editor-panel-content" aria-hidden={leftMode !== 'expanded'}
        className={cn('absolute inset-0 min-h-0 min-w-0 flex-col', leftMode === 'expanded' ? 'flex' : 'hidden')}>
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3">
          <h2 className="truncate text-sm font-semibold text-slate-700">{leftPanelTitle}</h2>
          {leftMode === 'expanded' && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
            data-testid="toggle-left-panel" data-left-mode={leftMode} aria-label={toggleLabel}
            aria-expanded="true" aria-controls="left-editor-panel-content" title={toggleLabel}
            onClick={onCycleLeftMode}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{leftPanel}</div>
      </div>
      <div aria-hidden={leftMode !== 'rail'}
        className={cn('absolute inset-0 min-h-0 flex-col border-r border-slate-200', leftMode === 'rail' ? 'flex' : 'hidden')}>
        <div className="flex h-10 shrink-0 items-center justify-center border-b border-slate-200 bg-slate-50">
          {leftMode === 'rail' && <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
            data-testid="toggle-left-panel" data-left-mode={leftMode} aria-label={toggleLabel}
            aria-expanded="false" aria-controls="left-editor-panel-content" title={toggleLabel}
            onClick={onCycleLeftMode}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>}
        </div>
        {leftRail}
      </div>
    </aside>

    {leftMode === 'expanded' && !isPhone && <div role="separator" aria-label="Resize tools panel" aria-orientation="vertical"
      aria-valuemin={240} aria-valuemax={360} aria-valuenow={displayLeftWidth} tabIndex={0}
      data-testid="left-panel-resizer" className="relative z-10 w-1 shrink-0 cursor-col-resize bg-slate-100 hover:bg-slate-300 focus-visible:bg-blue-400 focus-visible:outline-none"
      onMouseDown={beginMouseResize} onTouchStart={beginTouchResize}
      onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        onLeftExpandedWidthChange(displayLeftWidth + (event.key === 'ArrowRight' ? 16 : -16));
      }} />}

    {leftMode === 'hidden' && <Button type="button" variant="outline" size="icon"
      className="absolute left-1 top-1 z-20 h-8 w-8 bg-white shadow-sm"
      data-testid="toggle-left-panel" data-left-mode={leftMode} aria-label={toggleLabel}
      aria-expanded="false" aria-controls="left-editor-panel-content" title={toggleLabel}
      onClick={onCycleLeftMode}>
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Button>}

    <PanelGroup direction="horizontal" className="min-w-0 flex-1">
      <Panel id="canvas-panel" order={0} minSize={30} className="h-full min-w-0">
        {centerPanel}
      </Panel>

      <PanelResizeHandle data-testid="right-panel-resizer" disabled={rightCollapsed}
        className={rightCollapsed ? 'hidden' : 'w-1 bg-slate-100 hover:bg-slate-300 cursor-col-resize'} />

      <Panel id="right-panel" order={1} data-testid="right-editor-panel" ref={rightPanelRef}
        defaultSize={rightCollapsed ? 0 : rightPanelWidth} minSize={rightPanelMinSize}
        collapsible collapsedSize={0}
        onCollapse={() => onRightCollapsedChange?.(true)}
        onExpand={() => { rightHasOpened.current = true; onRightCollapsedChange?.(false); }}
        className="bg-white">
        <div id="right-editor-panel-content" className="flex min-h-0 h-full flex-col border-l border-gray-200"
          style={{ display: rightCollapsed ? 'none' : undefined }}>
          <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3">
            <h2 className="truncate text-sm font-semibold text-gray-700">{rightPanelTitle}</h2>
            {!rightCollapsed && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
              data-testid="toggle-right-panel" aria-label="Close right panel" aria-expanded="true"
              aria-controls="right-editor-panel-content" title={`Close ${rightPanelTitle}`}
              onClick={() => onRightCollapsedChange?.(true)}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-2">{rightPanel}</div>
        </div>
      </Panel>
    </PanelGroup>

    {rightCollapsed && <Button type="button" variant="outline" size="icon"
      className="absolute right-1 top-1 z-20 h-8 w-8 bg-white shadow-sm"
      data-testid="toggle-right-panel" aria-label="Open right panel" aria-expanded="false"
      aria-controls="right-editor-panel-content" title={`Open ${rightPanelTitle}`}
      onClick={() => onRightCollapsedChange?.(false)}>
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
    </Button>}
  </div>;
}
