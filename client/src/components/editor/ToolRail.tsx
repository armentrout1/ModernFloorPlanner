import { AlignHorizontalJustifyCenter, FlipHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PRIMARY_EDITOR_TOOLS } from './editorToolDefinitions';

interface ToolRailProps {
  activeTool: string;
  onSelectTool: (tool: string) => void;
  onRequestSection: (section: 'align' | 'transform') => void;
}

export default function ToolRail({ activeTool, onSelectTool, onRequestSection }: ToolRailProps) {
  return <TooltipProvider>
    <nav aria-label="Drawing tools" className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-2">
      {PRIMARY_EDITOR_TOOLS.map(tool => {
        const Icon = tool.icon;
        const active = activeTool === tool.id;
        return <Tooltip key={tool.id}>
          <TooltipTrigger asChild>
            <Button type="button" variant={active ? 'default' : 'ghost'} size="icon"
              className="h-10 w-10 shrink-0" aria-label={tool.label} aria-pressed={active}
              data-testid={`rail-tool-${tool.id}`} onClick={() => onSelectTool(tool.id)}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right"><p>{tool.description}</p></TooltipContent>
        </Tooltip>;
      })}
      <div className="my-1 h-px w-8 shrink-0 bg-slate-200" aria-hidden="true" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0"
            aria-label="Room alignment tools" onClick={() => onRequestSection('align')}>
            <AlignHorizontalJustifyCenter className="h-5 w-5" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right"><p>Open room alignment tools</p></TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0"
            aria-label="Room transform tools" onClick={() => onRequestSection('transform')}>
            <FlipHorizontal className="h-5 w-5" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right"><p>Open room transform tools</p></TooltipContent>
      </Tooltip>
    </nav>
  </TooltipProvider>;
}
