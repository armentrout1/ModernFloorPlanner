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

import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tooltip,
  TooltipTrigger,
  TooltipProvider,
  CenteredTooltipContent,
} from '@/components/ui/tooltip';
import {
  EDITOR_COMMANDS,
  getEditorCommand,
  getEditorCommandAvailability,
  getEditorCommandLabel,
  type EditorCommand,
  type EditorCommandContext,
  type EditorCommandId,
} from '@/features/editor-tools/registry';

interface SidebarProps {
  activeTool: string;
  commandContext: EditorCommandContext;
  onRunCommand: (commandId: EditorCommandId) => void;
  onOpenCommandSearch: () => void;
  requestedSection?: 'align' | 'transform' | null;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTool,
  commandContext,
  onRunCommand,
  onOpenCommandSearch,
  requestedSection,
}) => {
  const [openSections, setOpenSections] = useState<string[]>(['drawing', 'objects']);

  useEffect(() => {
    if (!requestedSection) return;
    setOpenSections(previous => previous.includes(requestedSection) ? previous : [...previous, requestedSection]);
  }, [requestedSection]);

  const renderCommand = (command: EditorCommand) => {
    const Icon = command.icon;
    const active = command.kind === 'tool' && activeTool === command.id;
    const label = getEditorCommandLabel(command, commandContext);
    const availability = getEditorCommandAvailability(command, commandContext);
    return <Tooltip key={command.id}>
      <TooltipTrigger asChild>
        <span className="block">
          <Button type="button" variant={active ? 'default' : 'outline'} size="sm"
            className="w-full justify-start" aria-pressed={command.kind === 'tool' ? active : undefined}
            aria-label={label}
            disabled={!availability.available} onClick={() => onRunCommand(command.id)}>
            <Icon className="mr-2 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
            {command.shortcut ? <span className="ml-auto pl-2 text-[10px] text-slate-500">{command.shortcut}</span> : null}
          </Button>
        </span>
      </TooltipTrigger>
      <CenteredTooltipContent>
        <p>{availability.available ? command.help : `Unavailable: ${availability.reason}`}</p>
      </CenteredTooltipContent>
    </Tooltip>;
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col overflow-y-auto h-full">
        <div className="p-3 pb-4 flex-grow">
          <Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
            <AccordionItem value="drawing">
              <AccordionTrigger className="px-2 py-2 text-sm">Drawing Tools</AccordionTrigger>
              <AccordionContent className="pt-2 pb-2">
                <div className="grid grid-cols-1 gap-2">
                  {EDITOR_COMMANDS.filter(command => command.group === 'drawing').map(renderCommand)}
                </div>
              </AccordionContent>
            </AccordionItem>
            
            <div className="py-3 space-y-2 border-b">
              {renderCommand(getEditorCommand('select-all'))}
              {renderCommand(getEditorCommand('toggle-room-names'))}
              <Button type="button" variant="outline" size="sm" className="w-full justify-start"
                aria-label="More tools" onClick={onOpenCommandSearch}>
                <Search className="mr-2 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">More tools</span>
                <span className="ml-auto pl-2 text-[10px] text-slate-500">Ctrl/Cmd+K</span>
              </Button>
              <p className="text-xs text-slate-500">Select &amp; Move: drag on empty grid to select rooms. Shift-click adds or removes rooms.</p>
            </div>
            <AccordionItem value="objects">
              <AccordionTrigger className="px-2 py-2 text-sm">Room Objects</AccordionTrigger>
              <AccordionContent className="pt-2 pb-2">
                <div className="grid grid-cols-1 gap-2">
                  {EDITOR_COMMANDS.filter(command => command.group === 'objects').map(renderCommand)}
                </div>
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="align">
              <AccordionTrigger className="px-2 py-2 text-sm">Room Alignment</AccordionTrigger>
              <AccordionContent className="pt-2 pb-2">
                <div className="space-y-2">
                  {EDITOR_COMMANDS.filter(command => command.group === 'alignment').map(renderCommand)}
                </div>
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="transform">
              <AccordionTrigger className="px-2 py-2 text-sm">Room Transform</AccordionTrigger>
              <AccordionContent className="pt-2 pb-2">
                <div className="space-y-2">
                  {EDITOR_COMMANDS.filter(command => command.group === 'transform').map(renderCommand)}
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
