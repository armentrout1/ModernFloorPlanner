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

interface SidebarProps {
  activeTool: string;
  onSelectTool: (tool: string) => void;
  onApplyAction: (action: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTool,
  onSelectTool,
  onApplyAction,
}) => {
  return (
    <div className="w-56 bg-slate-50 border-r border-slate-200 flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-slate-200">
        <h2 className="text-lg font-medium">Tools</h2>
      </div>
      
      <div className="p-2">
        <Accordion type="multiple" defaultValue={['drawing', 'objects', 'align']}>
          <AccordionItem value="drawing">
            <AccordionTrigger className="px-2 py-1.5 text-sm">Drawing Tools</AccordionTrigger>
            <AccordionContent className="pt-1 pb-2">
              <div className="grid grid-cols-2 gap-1">
                <Button
                  variant={activeTool === 'room' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start"
                  onClick={() => onSelectTool('room')}
                >
                  <Square className="h-4 w-4 mr-2" />
                  Room
                </Button>
                <Button
                  variant={activeTool === 'move' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start"
                  onClick={() => onSelectTool('move')}
                >
                  <Move className="h-4 w-4 mr-2" />
                  Move
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="objects">
            <AccordionTrigger className="px-2 py-1.5 text-sm">Room Objects</AccordionTrigger>
            <AccordionContent className="pt-1 pb-2">
              <div className="grid grid-cols-2 gap-1">
                <Button
                  variant={activeTool === 'door' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start"
                  onClick={() => onSelectTool('door')}
                >
                  <DoorOpenIcon className="h-4 w-4 mr-2" />
                  Door
                </Button>
                <Button
                  variant={activeTool === 'window' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start"
                  onClick={() => onSelectTool('window')}
                >
                  <WindowIcon className="h-4 w-4 mr-2" />
                  Window
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="align">
            <AccordionTrigger className="px-2 py-1.5 text-sm">Room Alignment</AccordionTrigger>
            <AccordionContent className="pt-1 pb-2">
              <div className="space-y-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onApplyAction('auto-align')}
                >
                  <LayoutTemplate className="h-4 w-4 mr-2" />
                  Auto-align Rooms
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onApplyAction('distribute-horizontal')}
                >
                  <ChevronsLeftRight className="h-4 w-4 mr-2" />
                  Distribute Horizontally
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onApplyAction('distribute-vertical')}
                >
                  <ChevronsUpDown className="h-4 w-4 mr-2" />
                  Distribute Vertically
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="transform">
            <AccordionTrigger className="px-2 py-1.5 text-sm">Room Transform</AccordionTrigger>
            <AccordionContent className="pt-1 pb-2">
              <div className="space-y-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onApplyAction('mirror-horizontal')}
                >
                  <FlipHorizontal className="h-4 w-4 mr-2" />
                  Mirror Horizontally
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onApplyAction('mirror-vertical')}
                >
                  <FlipVertical className="h-4 w-4 mr-2" />
                  Mirror Vertically
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onApplyAction('center-room')}
                >
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  Center in View
                </Button>
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
  );
};

export default Sidebar;