/**
 * CRITICAL: DOORS & WINDOWS FUNCTIONALITY
 * 
 * This file contains core doors/windows logic. Before making ANY changes:
 * 1. Read DOORS_AND_WINDOWS.md thoroughly
 * 2. Test all door/window placement scenarios after changes
 * 3. Verify drag-and-drop behavior still works
 * 4. Check property panel updates correctly
 * 
 * Last verified: June 1, 2025
 */

import React from 'react';
import { 
  Square,
  Move,
  DoorOpenIcon,
  Square as WindowIcon,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  FlipHorizontal,
  FlipVertical,
  LayoutGrid,
  ChevronsLeftRight,
  ChevronsUpDown,
  LayoutTemplate
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
  CenteredTooltipContent,
} from '@/components/ui/tooltip';

interface SidebarProps {
  activeTool: string;
  onSelectTool: (tool: string) => void;
  onApplyAction: (action: string) => void;
  onSelectAll: () => void;
  roomCount: number;
  showRoomNames: boolean;
  onToggleRoomNames: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTool,
  onSelectTool,
  onApplyAction, onSelectAll, roomCount, showRoomNames, onToggleRoomNames,
}) => {
  return (
    <TooltipProvider>
      <div className="flex flex-col overflow-y-auto h-full">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-medium">Tools</h2>
        </div>
        
        <div className="p-3 pb-4 flex-grow">
          <Accordion type="multiple" defaultValue={['drawing', 'objects']}>
            <AccordionItem value="drawing">
              <AccordionTrigger className="px-2 py-2 text-sm">Drawing Tools</AccordionTrigger>
              <AccordionContent className="pt-2 pb-2">
                <div className="grid grid-cols-1 gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={activeTool === 'room' ? 'default' : 'outline'}
                        size="sm"
                        className="justify-start w-full"
                        onClick={() => onSelectTool('room')}
                      >
                        <Square className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Draw Room</span>
                      </Button>
                    </TooltipTrigger>
                    <CenteredTooltipContent>
                      <p>Click and drag to draw a room (R)</p>
                    </CenteredTooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={activeTool === 'move' ? 'default' : 'outline'}
                        size="sm"
                        className="justify-start w-full"
                        onClick={() => onSelectTool('move')}
                      >
                        <Move className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Select & Move</span>
                      </Button>
                    </TooltipTrigger>
                    <CenteredTooltipContent>
                      <p>Select and move rooms or objects (M)</p>
                    </CenteredTooltipContent>
                  </Tooltip>
                </div>
              </AccordionContent>
            </AccordionItem>
            
            <div className="py-3 space-y-2 border-b">
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={onSelectAll} disabled={!roomCount}>Select all rooms</Button>
              <Button variant="outline" size="sm" className="w-full justify-start" aria-pressed={showRoomNames} onClick={onToggleRoomNames}>{showRoomNames ? 'Hide room names' : 'Show room names'}</Button>
              <p className="text-xs text-slate-500">Select &amp; Move: drag on empty grid to select rooms. Shift-click adds or removes rooms.</p>
            </div>
            <AccordionItem value="objects">
              <AccordionTrigger className="px-2 py-2 text-sm">Room Objects</AccordionTrigger>
              <AccordionContent className="pt-2 pb-2">
                <div className="grid grid-cols-1 gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={activeTool === 'door' ? 'default' : 'outline'}
                        size="sm"
                        className="justify-start w-full"
                        onClick={() => onSelectTool('door')}
                      >
                        <DoorOpenIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Add Door</span>
                      </Button>
                    </TooltipTrigger>
                    <CenteredTooltipContent>
                      <p>Select a wall to place a door (D)</p>
                    </CenteredTooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={activeTool === 'window' ? 'default' : 'outline'}
                        size="sm"
                        className="justify-start w-full"
                        onClick={() => onSelectTool('window')}
                      >
                        <WindowIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Add Window</span>
                      </Button>
                    </TooltipTrigger>
                    <CenteredTooltipContent>
                      <p>Select a wall to place a window (W)</p>
                    </CenteredTooltipContent>
                  </Tooltip>
                </div>
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="align">
              <AccordionTrigger className="px-2 py-2 text-sm">Room Alignment</AccordionTrigger>
              <AccordionContent className="pt-2 pb-2">
                <div className="space-y-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onApplyAction('auto-align')}
                      >
                        <LayoutTemplate className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Auto-Align Rooms</span>
                      </Button>
                    </TooltipTrigger>
                    <CenteredTooltipContent>
                      <p>Automatically align rooms by their edges</p>
                    </CenteredTooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onApplyAction('distribute-horizontal')}
                      >
                        <ChevronsLeftRight className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Distribute Horizontally</span>
                      </Button>
                    </TooltipTrigger>
                    <CenteredTooltipContent>
                      <p>Evenly space rooms horizontally</p>
                    </CenteredTooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onApplyAction('distribute-vertical')}
                      >
                        <ChevronsUpDown className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Distribute Vertically</span>
                      </Button>
                    </TooltipTrigger>
                    <CenteredTooltipContent>
                      <p>Evenly space rooms vertically</p>
                    </CenteredTooltipContent>
                  </Tooltip>
                </div>
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="transform">
              <AccordionTrigger className="px-2 py-2 text-sm">Room Transform</AccordionTrigger>
              <AccordionContent className="pt-2 pb-2">
                <div className="space-y-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onApplyAction('mirror-horizontal')}
                      >
                        <FlipHorizontal className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Mirror Horizontally</span>
                      </Button>
                    </TooltipTrigger>
                    <CenteredTooltipContent>
                      <p>Flip selected room horizontally</p>
                    </CenteredTooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onApplyAction('mirror-vertical')}
                      >
                        <FlipVertical className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Mirror Vertically</span>
                      </Button>
                    </TooltipTrigger>
                    <CenteredTooltipContent>
                      <p>Flip selected room vertically</p>
                    </CenteredTooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onApplyAction('center-room')}
                      >
                        <LayoutGrid className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Reposition Room</span>
                      </Button>
                    </TooltipTrigger>
                    <CenteredTooltipContent>
                      <p>Move one ungrouped room; use Fit drawing to center the view</p>
                    </CenteredTooltipContent>
                  </Tooltip>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        
        <div className="mt-auto p-3 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            <p>Tip: Use the door and window tools to add openings to your rooms.</p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default Sidebar;