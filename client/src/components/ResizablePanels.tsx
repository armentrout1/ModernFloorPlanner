import React, { type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Pin, PinOff, X } from 'lucide-react';
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
  rightPresentation?: 'desktop' | 'tablet' | 'phone';
  className?: string;
  rightCollapsed?: boolean;
  rightPinned?: boolean;
  onCycleLeftMode: () => void;
  onLeftExpandedWidthChange: (width: number) => void;
  onLeftModeChange: (mode: EditorLeftMode) => void;
  onRightCollapsedChange?: (collapsed: boolean) => void;
  onRightPinnedChange?: (pinned: boolean) => void;
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
  rightPresentation = 'desktop',
  className,
  rightCollapsed = false,
  rightPinned = false,
  onCycleLeftMode,
  onLeftExpandedWidthChange,
  onLeftModeChange,
  onRightCollapsedChange,
  onRightPinnedChange,
}: ResizablePanelsProps) {
  const rightPanelRef = React.useRef<HTMLElement>(null);
  const rightCloseRef = React.useRef<HTMLButtonElement>(null);
  const leftPanelRef = React.useRef<HTMLElement>(null);
  const resizeStart = React.useRef({ x: 0, width: leftExpandedWidth });
  const latestResizeWidth = React.useRef(leftExpandedWidth);
  const rightResizeStart = React.useRef({ x: 0, width: 0 });
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const overlayWasOpen = React.useRef(false);
  const [isResizingLeft, setIsResizingLeft] = React.useState(false);
  const [liveLeftWidth, setLiveLeftWidth] = React.useState<number | null>(null);
  const [isResizingRight, setIsResizingRight] = React.useState(false);
  const [rightWidth, setRightWidth] = React.useState(() => {
    const viewport = typeof window === 'undefined' ? 1280 : window.innerWidth;
    return Math.max(280, Math.min(560, viewport * rightPanelWidth / 100));
  });

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

  React.useEffect(() => {
    if (!isResizingRight) return;
    const minimum = Math.max(260, window.innerWidth * rightPanelMinSize / 100);
    const maximum = Math.min(640, Math.max(minimum, window.innerWidth - 420));
    const move = (clientX: number) => {
      const width = Math.max(minimum, Math.min(maximum,
        rightResizeStart.current.width + rightResizeStart.current.x - clientX));
      setRightWidth(width);
    };
    const mouseMove = (event: MouseEvent) => move(event.clientX);
    const touchMove = (event: TouchEvent) => {
      if (!event.touches.length) return;
      event.preventDefault();
      move(event.touches[0].clientX);
    };
    const finish = () => setIsResizingRight(false);
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
  }, [isResizingRight, rightPanelMinSize]);

  const rightOverlayOpen = rightPresentation !== 'desktop' && !rightCollapsed;
  const rightDocked = rightPresentation === 'desktop' && rightPinned;
  React.useLayoutEffect(() => {
    if (!rightCollapsed || rightPresentation === 'desktop' || !overlayWasOpen.current) return;
    const active = document.activeElement;
    const target = active instanceof HTMLElement && !rightPanelRef.current?.contains(active) ? active : returnFocus.current;
    const fallback = document.querySelector<HTMLElement>('[data-testid="toggle-right-panel"]');
    overlayWasOpen.current = false;
    requestAnimationFrame(() => (target?.isConnected ? target : fallback)?.focus({ preventScroll: true }));
  }, [rightCollapsed, rightPresentation]);

  React.useEffect(() => {
    if (!rightOverlayOpen) {
      if (overlayWasOpen.current) {
        overlayWasOpen.current = false;
      }
      return;
    }
    if (!overlayWasOpen.current) {
      overlayWasOpen.current = true;
      const active = document.activeElement;
      returnFocus.current = active instanceof HTMLElement && !rightPanelRef.current?.contains(active) ? active : null;
      requestAnimationFrame(() => rightCloseRef.current?.focus({ preventScroll: true }));
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onRightCollapsedChange?.(true);
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = rightPanelRef.current;
      if (!panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(element => element.getClientRects().length > 0 && !element.hasAttribute('disabled'));
      if (!controls.length) return;
      const first = controls[0], last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [rightOverlayOpen, onRightCollapsedChange]);

  React.useEffect(() => {
    if (rightOverlayOpen && isPhone && leftMode === 'expanded') onLeftModeChange('hidden');
  }, [isPhone, leftMode, onLeftModeChange, rightOverlayOpen]);

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
  const beginRightResize = (clientX: number) => {
    rightResizeStart.current = { x: clientX, width: rightWidth };
    setIsResizingRight(true);
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

    <div className="relative flex h-full min-w-0 flex-1 overflow-hidden">
      <div id="canvas-panel" className="h-full min-w-0 flex-1"
        style={{ '--canvas-control-right': rightCollapsed || rightDocked
          ? '3.5rem'
          : rightPresentation === 'desktop'
            ? `${rightWidth + 12}px`
            : rightPresentation === 'tablet'
              ? 'min(432px, calc(100% - 36px))'
              : '3.5rem' } as React.CSSProperties}>
        {centerPanel}
      </div>

      {rightDocked && !rightCollapsed && <div role="separator" aria-label="Resize properties panel"
        aria-orientation="vertical" aria-valuemin={260} aria-valuemax={640} aria-valuenow={Math.round(rightWidth)} tabIndex={0}
        data-testid="right-panel-resizer" className="relative z-10 w-1 shrink-0 cursor-col-resize bg-slate-100 hover:bg-slate-300 focus-visible:bg-blue-400 focus-visible:outline-none"
        onMouseDown={event => { if (event.button === 0) { event.preventDefault(); beginRightResize(event.clientX); } }}
        onTouchStart={event => { if (event.touches.length) beginRightResize(event.touches[0].clientX); }}
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          setRightWidth(width => Math.max(260, Math.min(640, width + (event.key === 'ArrowLeft' ? 16 : -16))));
        }} />}

      <aside id="right-panel" data-testid="right-editor-panel" data-presentation={rightPresentation}
        data-pinned={rightPinned ? 'true' : 'false'} ref={rightPanelRef}
        role={rightCollapsed ? undefined : rightPresentation === 'desktop' ? 'complementary' : 'dialog'}
        aria-label={rightPanelTitle}
        aria-hidden={rightCollapsed}
        className={cn('overflow-hidden bg-white motion-reduce:transition-none',
          rightCollapsed && 'invisible pointer-events-none',
          rightDocked && 'relative z-10 h-full shrink-0 transition-[width] duration-150',
          rightPresentation === 'desktop' && !rightDocked && 'absolute inset-y-0 right-0 z-40 h-full shadow-xl transition-[width] duration-150',
          rightPresentation === 'tablet' && 'absolute bottom-14 right-0 top-28 z-40 rounded-l-lg shadow-xl transition-[width] duration-150',
          rightPresentation === 'phone' && 'absolute inset-x-0 bottom-0 z-40 max-h-full rounded-t-xl shadow-2xl transition-[width,height] duration-150')}
        style={rightPresentation === 'desktop'
          ? { width: rightCollapsed ? 0 : rightWidth }
          : rightPresentation === 'tablet'
            ? { width: rightCollapsed ? 0 : 'min(420px, calc(100% - 48px))' }
            : { width: rightCollapsed ? 0 : '100%', height: rightCollapsed ? 0 : 'min(78%, 680px)' }}>
        <div id="right-editor-panel-content" className={cn('flex min-h-0 h-full flex-col border-l border-gray-200',
          rightCollapsed && 'invisible pointer-events-none')}>
          <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3">
            <h2 className="truncate text-sm font-semibold text-gray-700">{rightPanelTitle}</h2>
            <div className="flex shrink-0 items-center gap-1">
              {rightPresentation === 'desktop' && <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
                data-testid="pin-right-panel" aria-label={rightPinned ? 'Unpin properties panel' : 'Pin properties panel'}
                aria-pressed={rightPinned} title={rightPinned ? 'Unpin inspector' : 'Keep inspector open'}
                onClick={() => onRightPinnedChange?.(!rightPinned)}>
                {rightPinned ? <PinOff className="h-4 w-4" aria-hidden="true" /> : <Pin className="h-4 w-4" aria-hidden="true" />}
              </Button>}
              {!rightCollapsed && <Button ref={rightCloseRef} type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                data-testid="toggle-right-panel" aria-label="Close right panel" aria-expanded="true"
                aria-controls="right-editor-panel-content" title={`Close ${rightPanelTitle}`}
                onClick={() => onRightCollapsedChange?.(true)}>
                {rightDocked ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
              </Button>}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-2">{rightPanel}</div>
        </div>
      </aside>
    </div>

    {rightCollapsed && <Button type="button" variant="outline" size="icon"
      className="absolute right-1 top-1 z-20 h-8 w-8 bg-white shadow-sm"
      autoFocus={rightPresentation !== 'desktop' && overlayWasOpen.current}
      data-testid="toggle-right-panel" aria-label="Open right panel" aria-expanded="false"
      aria-controls="right-editor-panel-content" title={`Open ${rightPanelTitle}`}
      onClick={() => onRightCollapsedChange?.(false)}>
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
    </Button>}
  </div>;
}
